extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
    vec, Env, IntoVal,
};

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
    assert_eq!(s.client.members(&s.group), vec![&s.env, s.a.clone(), s.b.clone(), s.c.clone()]);
    assert_eq!(s.client.group_token(&s.group), s.token.address);
    assert_eq!(s.bal(&s.a), 0);
    let g2 = s.client.create_group(&s.b, &s.token.address);
    assert_eq!(g2, 2);
    assert_eq!(s.client.members(&g2), vec![&s.env, s.b.clone()]);
    assert_eq!(
        s.client.try_add_member(&s.group, &s.b),
        Err(Ok(Error::AlreadyMember.into()))
    );
    assert_eq!(s.client.try_members(&99), Err(Ok(Error::GroupNotFound.into())));
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
    assert!(r.is_err());
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
        s.client.try_add_expense(&s.group, &outsider, &hash(e, 3), &ok),
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
    assert!(s
        .client
        .try_add_expense(&s.group, &s.a, &hash(&s.env, 1), &deltas)
        .is_err());
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
    assert!(s.client.try_settle(&s.group, &s.b, &s.a, &100).is_err());
    assert_eq!(s.token.balance(&s.b), MINT);
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
    assert!(r.is_err());
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
    assert!(s.client.try_set_paused(&true).is_err());
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
