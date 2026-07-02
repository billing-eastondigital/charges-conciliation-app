// ============================================================
// Mock data — MoM revenue bridge: March → April 2026
//
// Numbers derived from:
//   March: $61,510.24 collected, 41 clients
//   April: $59,962.36 collected, 45 clients
//   Delta: -$1,547.88
//
// New clients (not in March): richie, ppucheu, tiradoalejandra, margaret
// Churned (in March, gone in April): none (0)
// Retained (41 clients): April collected = $59,962.36 - $9,680.00 = $50,282.36
//   avg ticket March: $61,510.24 / 41 = $1,500.25
//   avg ticket April: $50,282.36 / 41 = $1,226.40  → -$273.85/client
// ============================================================

export interface MoMTopMover {
  name: string;
  prior: number;
  current: number;
  delta: number;
}

export interface MoMBridgeData {
  prior_period: string;
  current_period: string;
  prior_collected: number;
  current_collected: number;
  delta: number;
  // Gained clients
  new_clients_revenue: number;
  new_client_count: number;
  new_clients: Array<{ name: string; amount: number }>;
  // Lost clients
  churned_revenue_lost: number;
  churned_client_count: number;
  churned_clients: Array<{ name: string; last_amount: number }>;
  // Retained client avg ticket shift
  retained_delta: number;
  retained_count: number;
  avg_ticket_prior: number;
  avg_ticket_current: number;
  avg_ticket_delta: number;
  // Individual movers within retained clients
  top_movers: MoMTopMover[];
}

export const aprilMoMBridge: MoMBridgeData = {
  prior_period:      "March 2026",
  current_period:    "April 2026",
  prior_collected:   61_510.24,
  current_collected: 59_962.36,
  delta:             -1_547.88,

  // 4 clients appeared in April that were not billed in March
  new_clients_revenue: 9_680.00,
  new_client_count:    4,
  new_clients: [
    { name: "richie@natcodb.com",          amount: 3_500.00 },
    { name: "ppucheu@pbm-solutions.com",   amount: 3_550.00 },
    { name: "tiradoalejandra.18@gmail.com",amount: 1_130.00 },
    { name: "margaret@lblegalnurses.com",  amount: 1_500.00 },
  ],

  // No clients lost between March and April
  churned_revenue_lost: 0,
  churned_client_count: 0,
  churned_clients: [],

  // Retained 41 clients: March $61,510.24 → April $50,282.36
  retained_delta:       -11_227.88,
  retained_count:       41,
  avg_ticket_prior:     1_500.25,  // 61510.24 / 41
  avg_ticket_current:   1_226.40,  // 50282.36 / 41
  avg_ticket_delta:     -273.85,

  // Top individual movers among retained clients (estimated vs known April actuals)
  top_movers: [
    // Up movers
    { name: "sgilly@trility.net",        prior: 8_000.00, current:  9_900.00, delta:  1_900.00 },
    { name: "mouldings.com",             prior: 3_500.50, current:  4_001.50, delta:    501.00 },
    { name: "mckinleyleather.com",       prior:   384.40, current:    512.40, delta:    128.00 },
    // Down movers
    { name: "gongs-unlimited.com",       prior: 6_300.00, current:  3_960.06, delta: -2_339.94 },
    { name: "jrgsupply.com",             prior: 3_800.00, current:  2_098.88, delta: -1_701.12 },
    { name: "yourelegantbar.com",        prior: 2_700.00, current:  1_746.95, delta:   -953.05 },
  ],
};
