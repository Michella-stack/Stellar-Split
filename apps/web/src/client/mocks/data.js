// Mock fixtures. Raw records only (members, expenses, settlements); balances are derived by the mock API
// with the same shared rules the real API uses, so the numbers always add up to zero.
// Addresses are valid-format Testnet public keys derived from a fixed seed; nobody holds their secret keys.

export const ME = 'GCPIF2AD2CXZXZ6KV3RXALAXJK427UMVGQCXNSTKOUGV2SY7E24NKBJS';

export const PEOPLE = {
  you: { address: ME, displayName: 'Alex', homeCurrency: 'EUR' },
  mateo: { address: 'GBC26U6ZOVTZFTQSN2OVEOBQGXAIM7UIMEUND7GAVG33VRJY2EL5R7RR', displayName: 'Mateo', homeCurrency: 'MXN' },
  valentina: { address: 'GD6FVZSK3A6T3YTNPZKLHEQRWHHJPFQHP46KSPB6VRNKBLAW6JMDPOJ7', displayName: 'Valentina', homeCurrency: 'COP' },
  jake: { address: 'GAJS4TV2WJ5IGQULYWPU7AHE5B5MOYSIPIKAID5OZQH5E2WI5RZQ6O5G', displayName: 'Jake', homeCurrency: 'USD' },
  ana: { address: 'GBJUR7XO7CGUIJ3QHWH6JZ2DA2CDL4PJKB27IRSRGOOH2EQIJ47JA2QW', displayName: 'Ana', homeCurrency: 'EUR' },
  ben: { address: 'GCAWNAPHJ42WMH26BZEUNBCEJFN27P6NACXL56QTSMTVNPCWXYSJVFQ2', displayName: 'Ben', homeCurrency: 'GBP' },
  carla: { address: 'GD4QFE7ACCQQFZXGQ7I73VRQLWVNMUP2A7PRS3PNJHPVO2IWDRQIEZY3', displayName: 'Carla', homeCurrency: 'BRL' },
  dani: { address: 'GCMFZJX4Z3EHGSO7BM5UCINYK54FVMZ2JV67ZFSHELQA5C2CSFCEJQXL', displayName: 'Dani', homeCurrency: 'EUR' },
  eva: { address: 'GC75WZZVJFUELEZGBQAYWGM54OA5UZ2FRLZL6KRV3SK7JFZ5VGJRGRNN', displayName: 'Eva', homeCurrency: 'EUR' },
};

export const AGENT_ADDRESS = 'GDU7JFVWZS277RFK5RC7ZXT7QQKEBAUPUDO5Q7YGWCAAAVUJBYRWZ3A7';

/** @param {keyof typeof PEOPLE} key */
const human = (key) => ({ id: `m-${key}`, kind: 'human', ...PEOPLE[key] });

const agentMember = {
  id: 'm-assist',
  kind: 'agent',
  agentId: 'assist',
  displayName: 'Stellar Assist',
  address: AGENT_ADDRESS,
  homeCurrency: null,
  ownerId: 'm-you',
};

const casaHumans = ['m-you', 'm-mateo', 'm-valentina', 'm-jake'];
const algarve = ['m-you', 'm-ana', 'm-ben', 'm-carla', 'm-dani', 'm-eva'];

export function initialState() {
  return {
    // No profile yet, so the first sign-in goes through onboarding.
    me: { address: ME, displayName: null, homeCurrency: null, email: null },
    groups: [
      {
        id: 'casa-alfama',
        name: 'Casa Alfama',
        type: 'flat',
        createdAt: '2026-10-01T09:00:00Z',
        members: [human('you'), human('mateo'), human('valentina'), human('jake'), agentMember],
        expenses: [
          // Net: You −364.60, Mateo +1172.20, Valentina −427.80, Jake −427.80, Stellar Assist +48.00.
          expense('e-rent', 'casa-alfama', 'Rent October', '1600.00', 'm-mateo', casaHumans, '2026-10-01T10:00:00Z', 'manual'),
          expense('e-power', 'casa-alfama', 'Electricity', '48.00', 'm-assist', casaHumans, '2026-10-12T08:30:00Z', 'agent'),
          expense('e-food', 'casa-alfama', 'Groceries', '63.20', 'm-you', casaHumans, '2026-10-20T18:45:00Z', 'manual'),
        ],
        settlements: [],
      },
      {
        id: 'algarve-trip',
        name: 'Algarve trip',
        type: 'trip',
        createdAt: '2026-08-02T12:00:00Z',
        members: [human('you'), human('ana'), human('ben'), human('carla'), human('dani'), human('eva')],
        expenses: [
          // Net: You +36.00, Ana +684.00, Ben/Carla/Dani/Eva −180.00 each.
          expense('e-villa', 'algarve-trip', 'Villa', '864.00', 'm-ana', algarve, '2026-08-03T15:00:00Z', 'manual'),
          expense('e-fuel', 'algarve-trip', 'Fuel', '216.00', 'm-you', algarve, '2026-08-05T09:10:00Z', 'manual'),
        ],
        settlements: [],
      },
    ],
    invites: { 'casa-alfama-7f3k': 'casa-alfama' },
    agent: {
      id: 'assist',
      displayName: 'Stellar Assist',
      address: AGENT_ADDRESS,
      ownerAddress: ME,
      groupIds: ['casa-alfama'],
      status: 'active',
      policy: {
        addBills: true,
        payBills: true,
        bills: ['Electricity', 'Internet'],
        maxPerPayment: '25.00',
        approvalAbove: '5.00',
        dailyCap: '50.00',
      },
      wallet: { balance: '38.00', asset: 'USDC' },
      spentToday: '12.00',
    },
    approvals: [
      {
        id: 'ap-internet',
        agentId: 'assist',
        groupId: 'casa-alfama',
        status: 'pending',
        description: 'Pay your internet share to Mateo',
        to: 'm-mateo',
        amount: '7.50',
        createdAt: '2026-10-25T08:05:00Z',
        expiresAt: '2026-10-25T09:05:00Z',
      },
    ],
    agentActivity: [
      { id: 'aa-1', kind: 'expense', status: 'done', description: 'Added Electricity to Casa Alfama', amount: '48.00', groupId: 'casa-alfama', createdAt: '2026-10-12T08:30:00Z' },
      { id: 'aa-2', kind: 'payment', status: 'done', description: 'Paid water share to Jake', amount: '12.00', to: 'm-jake', groupId: 'casa-alfama', createdAt: '2026-10-25T07:40:00Z' },
      { id: 'aa-3', kind: 'blocked', status: 'blocked', description: 'Payment to an unknown address', amount: '20.00', reason: "Address isn't in your group", groupId: 'casa-alfama', createdAt: '2026-10-25T07:55:00Z' },
      { id: 'aa-4', kind: 'approval', status: 'pending', description: 'Pay your internet share to Mateo', amount: '7.50', to: 'm-mateo', approvalId: 'ap-internet', groupId: 'casa-alfama', createdAt: '2026-10-25T08:05:00Z' },
    ],
  };
}

function expense(id, groupId, description, amount, paidBy, participants, createdAt, source) {
  return {
    id,
    groupId,
    description,
    amount,
    paidBy,
    split: { type: 'equal', participants },
    source,
    createdBy: paidBy,
    createdAt,
  };
}
