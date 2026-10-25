extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, Events as _, Ledger as _, MockAuth, MockAuthInvoke,
    },
    token::{StellarAssetClient, TokenClient},
    vec,
    xdr::{ScErrorCode, ScErrorType},
    Env, IntoVal, Map, Symbol, Val,
};

/// What the host returns when `require_auth` finds no matching authorization.
fn auth_err() -> soroban_sdk::Error {
    soroban_sdk::Error::from_type_and_code(ScErrorType::Context, ScErrorCode::InvalidAction)
}

struct Setup<'a> {
    env: Env,
    client: GroupContractClient<'a>,
    contract: Address,
    admin: Address,
    recorder: Address,
    token: TokenClient<'a>,
    group: u32,
    a: Address,
    b: Address,
    c: Address,
}

const MINT: i128 = 1_000_000;

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let recorder = Address::generate(&env);
    let contract = env.register(GroupContract, (&admin, &recorder));
    let client = GroupContractClient::new(&env, &contract);

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token_id = sac.address();
    let sac_admin = StellarAssetClient::new(&env, &token_id);
    let token = TokenClient::new(&env, &token_id);

    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let c = Address::generate(&env);
    for m in [&a, &b, &c] {
        sac_admin.mint(m, &MINT);
    }
    let group = client.create_group(&a, &token_id);
    client.add_member(&group, &b);
    client.add_member(&group, &c);
    Setup {
        env,
        client,
        contract,
        admin,
        recorder,
        token,
        group,
        a,
        b,
        c,
    }
}

fn hash(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

impl Setup<'_> {
    fn assert_custody_zero(&self) {
        assert_eq!(self.token.balance(&self.contract), 0);
    }
    fn bal(&self, m: &Address) -> i128 {
        self.client.balance(&self.group, m)
    }
    /// a paid 300 for a, b, c equally.
    fn equal_split(&self, n: u8) {
        let deltas = vec![
            &self.env,
            (self.a.clone(), 200i128),
            (self.b.clone(), -100i128),
            (self.c.clone(), -100i128),
        ];
        self.client
            .add_expense(&self.group, &self.a, &hash(&self.env, n), &deltas);
    }
}

#[test]
fn create_group_and_members() {
    let s = setup();
    assert_eq!(s.group, 1);
    assert_eq!(
        s.client.members(&s.group),
        vec![&s.env, s.a.clone(), s.b.clone(), s.c.clone()]
    );
    assert_eq!(s.client.group_token(&s.group), s.token.address);
    assert_eq!(s.bal(&s.a), 0);
    let g2 = s.client.create_group(&s.b, &s.token.address);
    assert_eq!(g2, 2);
    assert_eq!(s.client.members(&g2), vec![&s.env, s.b.clone()]);
    assert_eq!(
        s.client.try_add_member(&s.group, &s.b),
        Err(Ok(Error::AlreadyMember.into()))
    );
    assert_eq!(
        s.client.try_members(&99),
        Err(Ok(Error::GroupNotFound.into()))
    );
    assert_eq!(
        s.client.try_balance(&s.group, &s.admin),
        Err(Ok(Error::NotMember.into()))
    );
    s.assert_custody_zero();
}

#[test]
fn non_admin_add_member_fails() {
    let s = setup();
    let new = Address::generate(&s.env);
    // Only b signs, but the group admin is a.
    s.env.set_auths(&[]);
    let r = s
        .client
        .mock_auths(&[MockAuth {
            address: &s.b,
            invoke: &MockAuthInvoke {
                contract: &s.contract,
                fn_name: "add_member",
                args: (s.group, new.clone()).into_val(&s.env),
                sub_invokes: &[],
            },
        }])
        .try_add_member(&s.group, &new);
    assert_eq!(r, Err(Ok(auth_err())));
    assert_eq!(s.client.members(&s.group).len(), 3);
    // The group admin succeeds.
    s.client
        .mock_auths(&[MockAuth {
            address: &s.a,
            invoke: &MockAuthInvoke {
                contract: &s.contract,
                fn_name: "add_member",
                args: (s.group, new.clone()).into_val(&s.env),
                sub_invokes: &[],
            },
        }])
        .add_member(&s.group, &new);
    assert_eq!(s.client.members(&s.group).len(), 4);
}

#[test]
fn add_member_limit() {
    let s = setup();
    for _ in 3..MAX_MEMBERS {
        s.client.add_member(&s.group, &Address::generate(&s.env));
    }
    assert_eq!(
        s.client
            .try_add_member(&s.group, &Address::generate(&s.env)),
        Err(Ok(Error::TooManyMembers.into()))
    );
}

#[test]
fn equal_split_updates_balances() {
    let s = setup();
    s.equal_split(1);
    assert_eq!(s.bal(&s.a), 200);
    assert_eq!(s.bal(&s.b), -100);
    assert_eq!(s.bal(&s.c), -100);
    s.assert_custody_zero();
}

#[test]
fn expense_rejections() {
    let s = setup();
    let e = &s.env;
    let bad = vec![e, (s.a.clone(), 100i128), (s.b.clone(), -99i128)];
    assert_eq!(
        s.client.try_add_expense(&s.group, &s.a, &hash(e, 1), &bad),
        Err(Ok(Error::DeltasNotZeroSum.into()))
    );
    let outsider = Address::generate(e);
    let with_outsider = vec![e, (s.a.clone(), 10i128), (outsider.clone(), -10i128)];
    assert_eq!(
        s.client
            .try_add_expense(&s.group, &s.a, &hash(e, 2), &with_outsider),
        Err(Ok(Error::NotMember.into()))
    );
    let ok = vec![e, (s.a.clone(), 10i128), (s.b.clone(), -10i128)];
    assert_eq!(
        s.client
            .try_add_expense(&s.group, &outsider, &hash(e, 3), &ok),
        Err(Ok(Error::NotMember.into()))
    );
    assert_eq!(
        s.client
            .try_add_expense(&s.group, &s.a, &hash(e, 4), &Vec::new(e)),
        Err(Ok(Error::EmptyDeltas.into()))
    );
    let overflow = vec![e, (s.a.clone(), i128::MAX), (s.b.clone(), 1i128)];
    assert_eq!(
        s.client
            .try_add_expense(&s.group, &s.a, &hash(e, 5), &overflow),
        Err(Ok(Error::Overflow.into()))
    );
    s.client.add_expense(&s.group, &s.a, &hash(e, 6), &ok);
    assert_eq!(
        s.client.try_add_expense(&s.group, &s.a, &hash(e, 6), &ok),
        Err(Ok(Error::DuplicateExpense.into()))
    );
    assert_eq!(s.bal(&s.a), 10);
    s.assert_custody_zero();
}

#[test]
fn expense_requires_payer_auth() {
    let s = setup();
    let deltas = vec![&s.env, (s.a.clone(), 10i128), (s.b.clone(), -10i128)];
    s.env.set_auths(&[]);
    assert_eq!(
        s.client
            .try_add_expense(&s.group, &s.a, &hash(&s.env, 1), &deltas),
        Err(Ok(auth_err()))
    );
    assert_eq!(s.bal(&s.a), 0);
    // The hash was not burned by the rejected call.
    s.env.mock_all_auths();
    s.client
        .add_expense(&s.group, &s.a, &hash(&s.env, 1), &deltas);
    assert_eq!(s.bal(&s.a), 10);
}

#[test]
fn settle_moves_tokens_and_balances() {
    let s = setup();
    s.equal_split(1);
    s.client.settle(&s.group, &s.b, &s.a, &100);
    // Auth recorded for the debtor on settle.
    assert_eq!(s.env.auths()[0].0, s.b);
    assert_eq!(s.token.balance(&s.b), MINT - 100);
    assert_eq!(s.token.balance(&s.a), MINT + 100);
    assert_eq!(s.bal(&s.a), 100);
    assert_eq!(s.bal(&s.b), 0);
    s.assert_custody_zero();
}

#[test]
fn partial_settle() {
    let s = setup();
    s.equal_split(1);
    s.client.settle(&s.group, &s.c, &s.a, &40);
    assert_eq!(s.bal(&s.c), -60);
    assert_eq!(s.bal(&s.a), 160);
    s.client.settle(&s.group, &s.c, &s.a, &60);
    assert_eq!(s.bal(&s.c), 0);
    assert_eq!(s.token.balance(&s.c), MINT - 100);
    s.assert_custody_zero();
}

#[test]
fn settle_rejections() {
    let s = setup();
    s.equal_split(1);
    assert_eq!(
        s.client.try_settle(&s.group, &s.b, &s.a, &101),
        Err(Ok(Error::Overpay.into()))
    );
    assert_eq!(
        s.client.try_settle(&s.group, &s.b, &s.a, &0),
        Err(Ok(Error::InvalidAmount.into()))
    );
    assert_eq!(
        s.client.try_settle(&s.group, &s.b, &s.a, &-5),
        Err(Ok(Error::InvalidAmount.into()))
    );
    // Creditor paying debtor would increase a debt.
    assert_eq!(
        s.client.try_settle(&s.group, &s.a, &s.b, &10),
        Err(Ok(Error::DebtorNotNegative.into()))
    );
    // Debtor paying another debtor would increase a debt.
    assert_eq!(
        s.client.try_settle(&s.group, &s.b, &s.c, &10),
        Err(Ok(Error::CreditorNotPositive.into()))
    );
    assert_eq!(
        s.client.try_settle(&s.group, &s.b, &s.b, &10),
        Err(Ok(Error::SameAddress.into()))
    );
    assert_eq!(
        s.client.try_settle(&99, &s.b, &s.a, &10),
        Err(Ok(Error::GroupNotFound.into()))
    );
    assert_eq!(s.token.balance(&s.b), MINT);
    assert_eq!(s.bal(&s.b), -100);
    s.assert_custody_zero();
}

#[test]
fn settle_requires_debtor_auth() {
    let s = setup();
    s.equal_split(1);
    s.env.set_auths(&[]);
    assert_eq!(
        s.client.try_settle(&s.group, &s.b, &s.a, &100),
        Err(Ok(auth_err()))
    );
    assert_eq!(s.token.balance(&s.b), MINT);
    assert_eq!(s.bal(&s.b), -100);
}

#[test]
fn record_x402_settlement_rules() {
    let s = setup();
    s.equal_split(1);
    let tx = hash(&s.env, 9);
    s.client
        .record_x402_settlement(&s.group, &s.b, &s.a, &100, &tx);
    assert_eq!(s.env.auths()[0].0, s.recorder);
    assert_eq!(s.bal(&s.b), 0);
    assert_eq!(s.bal(&s.a), 100);
    // No token movement.
    assert_eq!(s.token.balance(&s.a), MINT);
    assert_eq!(s.token.balance(&s.b), MINT);
    s.assert_custody_zero();

    assert_eq!(
        s.client
            .try_record_x402_settlement(&s.group, &s.c, &s.a, &50, &tx),
        Err(Ok(Error::DuplicateTx.into()))
    );
    assert_eq!(
        s.client
            .try_record_x402_settlement(&s.group, &s.c, &s.a, &101, &hash(&s.env, 10)),
        Err(Ok(Error::Overpay.into()))
    );
}

#[test]
fn record_x402_only_recorder() {
    let s = setup();
    s.equal_split(1);
    let tx = hash(&s.env, 9);
    s.env.set_auths(&[]);
    let r = s
        .client
        .mock_auths(&[MockAuth {
            address: &s.b,
            invoke: &MockAuthInvoke {
                contract: &s.contract,
                fn_name: "record_x402_settlement",
                args: (s.group, s.b.clone(), s.a.clone(), 100i128, tx.clone()).into_val(&s.env),
                sub_invokes: &[],
            },
        }])
        .try_record_x402_settlement(&s.group, &s.b, &s.a, &100, &tx);
    assert_eq!(r, Err(Ok(auth_err())));
    assert_eq!(s.bal(&s.b), -100);
}

#[test]
fn paused_rejects_writes() {
    let s = setup();
    s.equal_split(1);
    s.client.set_paused(&true);
    assert_eq!(s.env.auths()[0].0, s.admin);
    let deltas = vec![&s.env, (s.a.clone(), 10i128), (s.b.clone(), -10i128)];
    assert_eq!(
        s.client
            .try_add_expense(&s.group, &s.a, &hash(&s.env, 2), &deltas),
        Err(Ok(Error::Paused.into()))
    );
    assert_eq!(
        s.client.try_settle(&s.group, &s.b, &s.a, &10),
        Err(Ok(Error::Paused.into()))
    );
    assert_eq!(
        s.client
            .try_record_x402_settlement(&s.group, &s.b, &s.a, &10, &hash(&s.env, 3)),
        Err(Ok(Error::Paused.into()))
    );
    // Reads still work, unpause restores writes.
    assert_eq!(s.bal(&s.b), -100);
    s.client.set_paused(&false);
    s.client.settle(&s.group, &s.b, &s.a, &10);
    s.assert_custody_zero();
}

#[test]
fn set_paused_requires_admin() {
    let s = setup();
    s.env.set_auths(&[]);
    assert_eq!(s.client.try_set_paused(&true), Err(Ok(auth_err())));
    // Still not paused.
    s.env.mock_all_auths();
    s.equal_split(1);
}

/// a = +30, b = -100, c = +70: the debtor owes more than either creditor is owed.
fn small_creditor(s: &Setup) {
    let deltas = vec![
        &s.env,
        (s.a.clone(), 30i128),
        (s.b.clone(), -100i128),
        (s.c.clone(), 70i128),
    ];
    s.client
        .add_expense(&s.group, &s.b, &hash(&s.env, 100), &deltas);
}

#[test]
fn settle_overpay_creditor_side() {
    let s = setup();
    small_creditor(&s);
    // 31 is within the debt (100) but above what a is owed (30).
    assert_eq!(
        s.client.try_settle(&s.group, &s.b, &s.a, &31),
        Err(Ok(Error::Overpay.into()))
    );
    assert_eq!(s.token.balance(&s.b), MINT);
    assert_eq!(s.token.balance(&s.a), MINT);
    assert_eq!((s.bal(&s.a), s.bal(&s.b), s.bal(&s.c)), (30, -100, 70));
    // Exactly what a is owed is accepted.
    s.client.settle(&s.group, &s.b, &s.a, &30);
    assert_eq!((s.bal(&s.a), s.bal(&s.b), s.bal(&s.c)), (0, -70, 70));
    assert_eq!(s.token.balance(&s.a), MINT + 30);
    s.assert_custody_zero();
}

#[test]
fn x402_overpay_creditor_side() {
    let s = setup();
    small_creditor(&s);
    assert_eq!(
        s.client
            .try_record_x402_settlement(&s.group, &s.b, &s.a, &31, &hash(&s.env, 1)),
        Err(Ok(Error::Overpay.into()))
    );
    assert_eq!((s.bal(&s.a), s.bal(&s.b)), (30, -100));
    s.client
        .record_x402_settlement(&s.group, &s.b, &s.a, &30, &hash(&s.env, 1));
    assert_eq!((s.bal(&s.a), s.bal(&s.b)), (0, -70));
}

/// A group whose members list is full (50 members); returns the member list.
fn full_group(s: &Setup) -> Vec<Address> {
    for _ in 3..MAX_MEMBERS {
        s.client.add_member(&s.group, &Address::generate(&s.env));
    }
    let members = s.client.members(&s.group);
    assert_eq!(members.len(), MAX_MEMBERS);
    members
}

#[test]
fn expense_delta_count_limit() {
    let s = setup();
    let members = full_group(&s);
    // 50 deltas: a +49, everyone else -1.
    let mut deltas: Vec<(Address, i128)> = Vec::new(&s.env);
    deltas.push_back((s.a.clone(), 49));
    for m in members.iter().skip(1) {
        deltas.push_back((m, -1));
    }
    assert_eq!(deltas.len(), MAX_MEMBERS);
    // 51 deltas, all members and zero-sum, is rejected for its length alone.
    let mut too_many = deltas.clone();
    too_many.push_back((s.a.clone(), 0));
    assert_eq!(
        s.client
            .try_add_expense(&s.group, &s.a, &hash(&s.env, 1), &too_many),
        Err(Ok(Error::TooManyMembers.into()))
    );
    assert_eq!(s.bal(&s.a), 0);
    // The boundary (exactly 50) is accepted, with the same hash.
    s.client
        .add_expense(&s.group, &s.a, &hash(&s.env, 1), &deltas);
    assert_eq!(s.bal(&s.a), 49);
}

fn persistent_ttl(s: &Setup, key: &DataKey) -> u32 {
    s.env
        .as_contract(&s.contract, || s.env.storage().persistent().get_ttl(key))
}

fn instance_ttl(s: &Setup) -> u32 {
    s.env
        .as_contract(&s.contract, || s.env.storage().instance().get_ttl())
}

fn advance_ledgers(s: &Setup, n: u32) {
    s.env.ledger().with_mut(|l| l.sequence_number += n);
}

#[test]
fn ttl_extended_on_write() {
    let s = setup();
    let ba = DataKey::Balance(s.group, s.a.clone());
    assert_eq!(persistent_ttl(&s, &DataKey::Group(s.group)), TTL_EXTEND_TO);
    assert_eq!(
        persistent_ttl(&s, &DataKey::Members(s.group)),
        TTL_EXTEND_TO
    );
    assert_eq!(persistent_ttl(&s, &ba), TTL_EXTEND_TO);
    assert_eq!(instance_ttl(&s), TTL_EXTEND_TO);

    // Two days later every entry has decayed below the threshold.
    advance_ledgers(&s, 2 * DAY_IN_LEDGERS);
    assert_eq!(persistent_ttl(&s, &ba), TTL_EXTEND_TO - 2 * DAY_IN_LEDGERS);
    assert_eq!(instance_ttl(&s), TTL_EXTEND_TO - 2 * DAY_IN_LEDGERS);

    // A write extends the entries it touches back to the full period.
    s.equal_split(1);
    assert_eq!(persistent_ttl(&s, &ba), TTL_EXTEND_TO);
    assert_eq!(
        persistent_ttl(&s, &DataKey::Expense(s.group, hash(&s.env, 1))),
        TTL_EXTEND_TO
    );
    s.client.add_member(&s.group, &Address::generate(&s.env));
    assert_eq!(
        persistent_ttl(&s, &DataKey::Members(s.group)),
        TTL_EXTEND_TO
    );
    s.client.set_paused(&true);
    assert_eq!(instance_ttl(&s), TTL_EXTEND_TO);

    // Within the threshold nothing is extended, the TTL just keeps counting down.
    advance_ledgers(&s, 100);
    assert_eq!(persistent_ttl(&s, &ba), TTL_EXTEND_TO - 100);
    assert_eq!(instance_ttl(&s), TTL_EXTEND_TO - 100);
}

#[test]
fn x402_rejection_matrix() {
    let s = setup();
    s.equal_split(1);
    let e = &s.env;
    let tx = hash(e, 9);
    let outsider = Address::generate(e);
    let rec = |group: u32, from: &Address, to: &Address, amount: i128| {
        s.client
            .try_record_x402_settlement(&group, from, to, &amount, &tx)
    };
    let g = s.group;
    assert_eq!(rec(g, &s.b, &s.b, 10), Err(Ok(Error::SameAddress.into())));
    assert_eq!(rec(g, &s.b, &s.a, 0), Err(Ok(Error::InvalidAmount.into())));
    assert_eq!(rec(g, &s.b, &s.a, -1), Err(Ok(Error::InvalidAmount.into())));
    assert_eq!(
        rec(g, &s.a, &s.b, 10),
        Err(Ok(Error::DebtorNotNegative.into()))
    );
    assert_eq!(
        rec(g, &s.b, &s.c, 10),
        Err(Ok(Error::CreditorNotPositive.into()))
    );
    assert_eq!(
        rec(g, &outsider, &s.a, 10),
        Err(Ok(Error::NotMember.into()))
    );
    assert_eq!(
        rec(g, &s.b, &outsider, 10),
        Err(Ok(Error::NotMember.into()))
    );
    assert_eq!(
        rec(99, &s.b, &s.a, 10),
        Err(Ok(Error::GroupNotFound.into()))
    );
    // None of the rejected calls changed balances or burned the hash.
    assert_eq!((s.bal(&s.a), s.bal(&s.b), s.bal(&s.c)), (200, -100, -100));
    s.client
        .record_x402_settlement(&s.group, &s.b, &s.a, &100, &tx);
    assert_eq!(s.bal(&s.b), 0);
    s.assert_custody_zero();
}

/// Expected `(contract, topics, data)` for one event: topics are the event
/// name and the group id, data is a map of the given fields.
fn event(s: &Setup, name: &str, group: u32, data: &[(&str, Val)]) -> (Address, Vec<Val>, Val) {
    let e = &s.env;
    let mut topics: Vec<Val> = Vec::new(e);
    topics.push_back(Symbol::new(e, name).into_val(e));
    topics.push_back(group.into_val(e));
    let mut m = Map::<Symbol, Val>::new(e);
    for (k, v) in data {
        m.set(Symbol::new(e, k), *v);
    }
    (s.contract.clone(), topics, m.into_val(e))
}

fn val<T: IntoVal<Env, Val>>(s: &Setup, t: T) -> Val {
    t.into_val(&s.env)
}

/// The group contract's events from the last invocation must equal `want`.
fn assert_events(s: &Setup, want: &[(Address, Vec<Val>, Val)]) {
    let mut v: Vec<(Address, Vec<Val>, Val)> = Vec::new(&s.env);
    for w in want {
        v.push_back(w.clone());
    }
    assert_eq!(s.env.events().all().filter_by_contract(&s.contract), v);
}

#[test]
fn events_emitted_with_exact_topics_and_data() {
    let s = setup();
    let tok = s.token.address.clone();

    // create_group emits group_created, then member_added for the admin.
    let g = s.client.create_group(&s.b, &tok);
    assert_events(
        &s,
        &[
            event(
                &s,
                "group_created",
                g,
                &[
                    ("admin", val(&s, s.b.clone())),
                    ("token", val(&s, tok.clone())),
                ],
            ),
            event(&s, "member_added", g, &[("member", val(&s, s.b.clone()))]),
        ],
    );

    s.client.add_member(&g, &s.a);
    assert_events(
        &s,
        &[event(
            &s,
            "member_added",
            g,
            &[("member", val(&s, s.a.clone()))],
        )],
    );

    let deltas = vec![&s.env, (s.a.clone(), 100i128), (s.b.clone(), -100i128)];
    s.client.add_expense(&g, &s.a, &hash(&s.env, 1), &deltas);
    assert_events(
        &s,
        &[event(
            &s,
            "expense_added",
            g,
            &[
                ("payer", val(&s, s.a.clone())),
                ("expense_hash", val(&s, hash(&s.env, 1))),
                ("deltas", val(&s, deltas.clone())),
            ],
        )],
    );

    s.client.settle(&g, &s.b, &s.a, &60);
    assert_events(
        &s,
        &[event(
            &s,
            "settled",
            g,
            &[
                ("from", val(&s, s.b.clone())),
                ("to", val(&s, s.a.clone())),
                ("amount", val(&s, 60i128)),
            ],
        )],
    );

    s.client
        .record_x402_settlement(&g, &s.b, &s.a, &40, &hash(&s.env, 2));
    assert_events(
        &s,
        &[event(
            &s,
            "x402_recorded",
            g,
            &[
                ("from", val(&s, s.b.clone())),
                ("to", val(&s, s.a.clone())),
                ("amount", val(&s, 40i128)),
                ("tx_hash", val(&s, hash(&s.env, 2))),
            ],
        )],
    );

    // A failed call emits nothing, not even events of this contract's earlier calls.
    assert!(s.client.try_settle(&g, &s.b, &s.a, &1).is_err());
    assert_eq!(s.env.events().all().events().len(), 0);
}

#[test]
fn overflow_at_i128_limits() {
    let s = setup();
    // b = i128::MIN, a = i128::MAX, c = 1. Running sum stays in range.
    let deltas = vec![
        &s.env,
        (s.b.clone(), i128::MIN),
        (s.a.clone(), i128::MAX),
        (s.c.clone(), 1i128),
    ];
    s.client
        .add_expense(&s.group, &s.a, &hash(&s.env, 1), &deltas);
    let state = |s: &Setup| (s.bal(&s.a), s.bal(&s.b), s.bal(&s.c));
    assert_eq!(state(&s), (i128::MAX, i128::MIN, 1));

    // -i128::MIN does not fit.
    assert_eq!(
        s.client.try_settle(&s.group, &s.b, &s.a, &1),
        Err(Ok(Error::Overflow.into()))
    );
    assert_eq!(
        s.client
            .try_record_x402_settlement(&s.group, &s.b, &s.c, &1, &hash(&s.env, 2)),
        Err(Ok(Error::Overflow.into()))
    );
    assert_eq!(state(&s), (i128::MAX, i128::MIN, 1));
    assert_eq!(s.token.balance(&s.b), MINT);
    s.assert_custody_zero();

    // balance + delta overflows on a. c is written first and must be rolled back.
    let over = vec![&s.env, (s.c.clone(), -1i128), (s.a.clone(), 1i128)];
    assert_eq!(
        s.client
            .try_add_expense(&s.group, &s.a, &hash(&s.env, 3), &over),
        Err(Ok(Error::Overflow.into()))
    );
    assert_eq!(state(&s), (i128::MAX, i128::MIN, 1));
    // Same for a negative overflow on b.
    let under = vec![&s.env, (s.c.clone(), 1i128), (s.b.clone(), -1i128)];
    assert_eq!(
        s.client
            .try_add_expense(&s.group, &s.a, &hash(&s.env, 3), &under),
        Err(Ok(Error::Overflow.into()))
    );
    assert_eq!(state(&s), (i128::MAX, i128::MIN, 1));
    // Hash 3 was not burned by the failed calls.
    let ok = vec![&s.env, (s.c.clone(), -1i128), (s.b.clone(), 1i128)];
    s.client.add_expense(&s.group, &s.a, &hash(&s.env, 3), &ok);
    assert_eq!(state(&s), (i128::MAX, i128::MIN + 1, 0));
}

#[test]
fn next_group_overflow() {
    let s = setup();
    s.env.as_contract(&s.contract, || {
        s.env
            .storage()
            .instance()
            .set(&DataKey::NextGroup, &u32::MAX)
    });
    assert_eq!(
        s.client.try_create_group(&s.b, &s.token.address),
        Err(Ok(Error::Overflow.into()))
    );
    // Nothing was created and the counter did not move.
    assert_eq!(
        s.client.try_members(&u32::MAX),
        Err(Ok(Error::GroupNotFound.into()))
    );
    let next: u32 = s.env.as_contract(&s.contract, || {
        s.env.storage().instance().get(&DataKey::NextGroup).unwrap()
    });
    assert_eq!(next, u32::MAX);
}

#[test]
fn group_not_found_everywhere() {
    let s = setup();
    let e = &s.env;
    let nf: soroban_sdk::Error = Error::GroupNotFound.into();
    let new = Address::generate(e);
    assert_eq!(s.client.try_add_member(&99, &new), Err(Ok(nf)));
    let deltas = vec![e, (s.a.clone(), 10i128), (s.b.clone(), -10i128)];
    assert_eq!(
        s.client.try_add_expense(&99, &s.a, &hash(e, 1), &deltas),
        Err(Ok(nf))
    );
    assert_eq!(
        s.client
            .try_record_x402_settlement(&99, &s.b, &s.a, &10, &hash(e, 1)),
        Err(Ok(nf))
    );
    assert_eq!(s.client.try_balance(&99, &s.a), Err(Ok(nf)));
    assert_eq!(s.client.try_group_token(&99), Err(Ok(nf)));
    assert_eq!(s.client.try_settle(&99, &s.b, &s.a, &10), Err(Ok(nf)));
    assert_eq!(s.client.try_members(&0), Err(Ok(nf)));
}

#[test]
fn create_group_requires_auth() {
    let s = setup();
    s.env.set_auths(&[]);
    assert_eq!(
        s.client.try_create_group(&s.b, &s.token.address),
        Err(Ok(auth_err()))
    );
    // The id was not consumed by the rejected call.
    s.env.mock_all_auths();
    assert_eq!(s.client.create_group(&s.b, &s.token.address), 2);
}

#[test]
fn paused_allows_group_management() {
    let s = setup();
    s.client.set_paused(&true);
    let g2 = s.client.create_group(&s.b, &s.token.address);
    assert_eq!(g2, 2);
    let new = Address::generate(&s.env);
    s.client.add_member(&g2, &new);
    assert_eq!(s.client.members(&g2).len(), 2);
}

#[test]
fn failed_calls_leave_state_unchanged() {
    let s = setup();
    let e = &s.env;
    let snapshot = |s: &Setup| (s.bal(&s.a), s.bal(&s.b), s.bal(&s.c));

    // A rejected expense does not burn its hash.
    let bad = vec![e, (s.a.clone(), 100i128), (s.b.clone(), -99i128)];
    assert_eq!(
        s.client.try_add_expense(&s.group, &s.a, &hash(e, 7), &bad),
        Err(Ok(Error::DeltasNotZeroSum.into()))
    );
    s.equal_split(7);
    assert_eq!(snapshot(&s), (200, -100, -100));

    // A rejected x402 settlement does not burn its tx hash.
    let tx = hash(e, 9);
    assert_eq!(
        s.client
            .try_record_x402_settlement(&s.group, &s.b, &s.a, &101, &tx),
        Err(Ok(Error::Overpay.into()))
    );
    s.client
        .record_x402_settlement(&s.group, &s.b, &s.a, &100, &tx);
    assert_eq!(snapshot(&s), (100, 0, -100));
    assert_eq!(
        s.client
            .try_record_x402_settlement(&s.group, &s.c, &s.a, &10, &tx),
        Err(Ok(Error::DuplicateTx.into()))
    );
    assert_eq!(snapshot(&s), (100, 0, -100));

    // If the token transfer fails, the ledger update done before it is rolled back.
    let big = MINT + 1;
    let deltas = vec![e, (s.a.clone(), big), (s.c.clone(), -big)];
    s.client.add_expense(&s.group, &s.a, &hash(e, 8), &deltas);
    let before = snapshot(&s);
    assert!(s.client.try_settle(&s.group, &s.c, &s.a, &big).is_err());
    assert_eq!(snapshot(&s), before);
    assert_eq!(s.token.balance(&s.c), MINT);
    s.assert_custody_zero();
}

#[test]
fn duplicate_check_scopes() {
    let s = setup();
    let e = &s.env;
    // Second group with the same token, a and b as members.
    let g2 = s.client.create_group(&s.b, &s.token.address);
    s.client.add_member(&g2, &s.a);

    // expense_hash is scoped per group: hash 1 is accepted in both.
    s.equal_split(1);
    let d2 = vec![e, (s.a.clone(), 50i128), (s.b.clone(), -50i128)];
    s.client.add_expense(&g2, &s.a, &hash(e, 1), &d2);
    assert_eq!(
        s.client.try_add_expense(&g2, &s.a, &hash(e, 1), &d2),
        Err(Ok(Error::DuplicateExpense.into()))
    );
    assert_eq!(s.client.balance(&g2, &s.b), -50);

    // x402 tx_hash is global: used in group 1, rejected in group 2.
    let tx = hash(e, 9);
    s.client
        .record_x402_settlement(&s.group, &s.b, &s.a, &100, &tx);
    assert_eq!(
        s.client
            .try_record_x402_settlement(&g2, &s.b, &s.a, &50, &tx),
        Err(Ok(Error::DuplicateTx.into()))
    );
    assert_eq!(
        (s.client.balance(&g2, &s.a), s.client.balance(&g2, &s.b)),
        (50, -50)
    );
}

/// xorshift64, deterministic so failures reproduce.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

#[test]
fn zero_sum_invariant_randomized() {
    let s = setup();
    let e = &s.env;
    let members = [s.a.clone(), s.b.clone(), s.c.clone()];
    let mut rng = Rng(0x5eed_1234_abcd_ef01);
    let mut n: u32 = 0;
    for _ in 0..200 {
        n += 1;
        let mut h = [0u8; 32];
        h[..4].copy_from_slice(&n.to_be_bytes());
        let h = BytesN::from_array(e, &h);
        let i = rng.below(3) as usize;
        let j = (i + 1 + rng.below(2) as usize) % 3;
        let (x, y) = (&members[i], &members[j]);
        match rng.below(3) {
            0 => {
                let amt = 1 + rng.below(500) as i128;
                let deltas = vec![e, (x.clone(), amt), (y.clone(), -amt)];
                s.client.add_expense(&s.group, x, &h, &deltas);
            }
            op => {
                let (fx, ty) = (s.bal(x), s.bal(y));
                if fx < 0 && ty > 0 {
                    let max = (-fx).min(ty);
                    let amt = 1 + rng.below(max as u64) as i128;
                    if op == 1 {
                        s.client.settle(&s.group, x, y, &amt);
                    } else {
                        s.client.record_x402_settlement(&s.group, x, y, &amt, &h);
                    }
                } else if fx >= 0 {
                    // Must fail and leave balances untouched.
                    assert!(s.client.try_settle(&s.group, x, y, &1).is_err());
                }
            }
        }
        let sum: i128 = members.iter().map(|m| s.bal(m)).sum();
        assert_eq!(sum, 0);
        s.assert_custody_zero();
    }
    // Token supply is conserved across members.
    let total: i128 = members.iter().map(|m| s.token.balance(m)).sum();
    assert_eq!(total, 3 * MINT);
}
