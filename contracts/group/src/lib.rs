#![no_std]
//! Non-custodial group ledger for Ledgerly.
//! Sign convention: positive net balance = is owed money, negative = owes.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, BytesN, Env, Vec,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_EXTEND_TO: u32 = 30 * DAY_IN_LEDGERS;
const TTL_THRESHOLD: u32 = TTL_EXTEND_TO - DAY_IN_LEDGERS;
// Bounds the members list, which lives in one ledger entry.
pub const MAX_MEMBERS: u32 = 50;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    GroupNotFound = 1,
    NotMember = 2,
    AlreadyMember = 3,
    DeltasNotZeroSum = 4,
    EmptyDeltas = 5,
    DuplicateExpense = 6,
    InvalidAmount = 7,
    DebtorNotNegative = 8,
    CreditorNotPositive = 9,
    Overpay = 10,
    DuplicateTx = 11,
    Overflow = 12,
    Paused = 13,
    TooManyMembers = 14,
    SameAddress = 15,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Recorder,
    Paused,
    NextGroup,
    Group(u32),
    Members(u32),
    Balance(u32, Address),
    Expense(u32, BytesN<32>),
    X402Tx(BytesN<32>),
}

#[contracttype]
#[derive(Clone)]
struct GroupInfo {
    admin: Address,
    token: Address,
}

#[contractevent]
pub struct GroupCreated {
    #[topic]
    pub group: u32,
    pub admin: Address,
    pub token: Address,
}

#[contractevent]
pub struct MemberAdded {
    #[topic]
    pub group: u32,
    pub member: Address,
}

#[contractevent]
pub struct ExpenseAdded {
    #[topic]
    pub group: u32,
    pub payer: Address,
    pub expense_hash: BytesN<32>,
    pub deltas: Vec<(Address, i128)>,
}

#[contractevent]
pub struct Settled {
    #[topic]
    pub group: u32,
    pub from: Address,
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
pub struct X402Recorded {
    #[topic]
    pub group: u32,
    pub from: Address,
    pub to: Address,
    pub amount: i128,
    pub tx_hash: BytesN<32>,
}

#[contract]
pub struct GroupContract;

fn put<V: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey, val: &V) {
    let s = env.storage().persistent();
    s.set(key, val);
    s.extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn group_info(env: &Env, group: u32) -> GroupInfo {
    env.storage()
        .persistent()
        .get(&DataKey::Group(group))
        .unwrap_or_else(|| panic_with_error!(env, Error::GroupNotFound))
}

fn net(env: &Env, group: u32, member: &Address) -> Option<i128> {
    env.storage()
        .persistent()
        .get(&DataKey::Balance(group, member.clone()))
}

fn member_net(env: &Env, group: u32, member: &Address) -> i128 {
    net(env, group, member).unwrap_or_else(|| panic_with_error!(env, Error::NotMember))
}

fn require_not_paused(env: &Env) {
    if env
        .storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
    {
        panic_with_error!(env, Error::Paused);
    }
}

fn add(env: &Env, a: i128, b: i128) -> i128 {
    a.checked_add(b)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow))
}

/// Checks settle rules and applies net(from) += amount, net(to) -= amount.
fn apply_settlement(env: &Env, group: u32, from: &Address, to: &Address, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, Error::InvalidAmount);
    }
    if from == to {
        panic_with_error!(env, Error::SameAddress);
    }
    let from_net = member_net(env, group, from);
    let to_net = member_net(env, group, to);
    if from_net >= 0 {
        panic_with_error!(env, Error::DebtorNotNegative);
    }
    if to_net <= 0 {
        panic_with_error!(env, Error::CreditorNotPositive);
    }
    // from_net < 0 so -from_net cannot overflow except at i128::MIN.
    let debt = from_net
        .checked_neg()
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    if amount > debt.min(to_net) {
        panic_with_error!(env, Error::Overpay);
    }
    put(env, &DataKey::Balance(group, from.clone()), &add(env, from_net, amount));
    put(env, &DataKey::Balance(group, to.clone()), &add(env, to_net, -amount));
}

#[contractimpl]
impl GroupContract {
    pub fn __constructor(env: Env, admin: Address, recorder: Address) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Recorder, &recorder);
        s.set(&DataKey::NextGroup, &1u32);
        bump_instance(&env);
    }

    pub fn set_paused(env: Env, paused: bool) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &paused);
        bump_instance(&env);
    }

    pub fn create_group(env: Env, admin: Address, token: Address) -> u32 {
        admin.require_auth();
        let id: u32 = env.storage().instance().get(&DataKey::NextGroup).unwrap_or(1);
        let next = id
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        env.storage().instance().set(&DataKey::NextGroup, &next);
        bump_instance(&env);
        put(
            &env,
            &DataKey::Group(id),
            &GroupInfo {
                admin: admin.clone(),
                token: token.clone(),
            },
        );
        put(&env, &DataKey::Members(id), &Vec::from_array(&env, [admin.clone()]));
        put(&env, &DataKey::Balance(id, admin.clone()), &0i128);
        GroupCreated {
            group: id,
            admin: admin.clone(),
            token,
        }
        .publish(&env);
        MemberAdded { group: id, member: admin }.publish(&env);
        id
    }

    pub fn add_member(env: Env, group: u32, member: Address) {
        group_info(&env, group).admin.require_auth();
        if net(&env, group, &member).is_some() {
            panic_with_error!(&env, Error::AlreadyMember);
        }
        let mut members = Self::members(env.clone(), group);
        if members.len() >= MAX_MEMBERS {
            panic_with_error!(&env, Error::TooManyMembers);
        }
        members.push_back(member.clone());
        put(&env, &DataKey::Members(group), &members);
        put(&env, &DataKey::Balance(group, member.clone()), &0i128);
        MemberAdded { group, member }.publish(&env);
    }

    pub fn add_expense(
        env: Env,
        group: u32,
        payer: Address,
        expense_hash: BytesN<32>,
        deltas: Vec<(Address, i128)>,
    ) {
        require_not_paused(&env);
        payer.require_auth();
        group_info(&env, group);
        member_net(&env, group, &payer);
        if deltas.is_empty() {
            panic_with_error!(&env, Error::EmptyDeltas);
        }
        if deltas.len() > MAX_MEMBERS {
            panic_with_error!(&env, Error::TooManyMembers);
        }
        let key = DataKey::Expense(group, expense_hash.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, Error::DuplicateExpense);
        }
        let mut sum: i128 = 0;
        for (who, d) in deltas.iter() {
            member_net(&env, group, &who);
            sum = add(&env, sum, d);
        }
        if sum != 0 {
            panic_with_error!(&env, Error::DeltasNotZeroSum);
        }
        for (who, d) in deltas.iter() {
            let b = member_net(&env, group, &who);
            put(&env, &DataKey::Balance(group, who), &add(&env, b, d));
        }
        put(&env, &key, &true);
        ExpenseAdded {
            group,
            payer,
            expense_hash,
            deltas,
        }
        .publish(&env);
    }

    pub fn settle(env: Env, group: u32, from: Address, to: Address, amount: i128) {
        require_not_paused(&env);
        from.require_auth();
        let info = group_info(&env, group);
        apply_settlement(&env, group, &from, &to, amount);
        // Direct debtor to creditor transfer, the contract never holds tokens.
        token::Client::new(&env, &info.token).transfer(&from, &to, &amount);
        Settled {
            group,
            from,
            to,
            amount,
        }
        .publish(&env);
    }

    pub fn record_x402_settlement(
        env: Env,
        group: u32,
        from: Address,
        to: Address,
        amount: i128,
        tx_hash: BytesN<32>,
    ) {
        require_not_paused(&env);
        let recorder: Address = env.storage().instance().get(&DataKey::Recorder).unwrap();
        recorder.require_auth();
        group_info(&env, group);
        let key = DataKey::X402Tx(tx_hash.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, Error::DuplicateTx);
        }
        apply_settlement(&env, group, &from, &to, amount);
        put(&env, &key, &group);
        X402Recorded {
            group,
            from,
            to,
            amount,
            tx_hash,
        }
        .publish(&env);
    }

    pub fn balance(env: Env, group: u32, member: Address) -> i128 {
        group_info(&env, group);
        member_net(&env, group, &member)
    }

    pub fn members(env: Env, group: u32) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Members(group))
            .unwrap_or_else(|| panic_with_error!(&env, Error::GroupNotFound))
    }

    pub fn group_token(env: Env, group: u32) -> Address {
        group_info(&env, group).token
    }
}

#[cfg(test)]
mod test;
