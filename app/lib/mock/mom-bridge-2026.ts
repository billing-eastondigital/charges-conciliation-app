// ============================================================
// Month-over-month revenue bridge — March → April 2026
//
// Decomposition of the -$1,547.88 delta:
//   New clients:        +$7,050.00  (richie $3,500 + ppucheu $3,550)
//   Existing clients ↑: +$1,650.00  (3 clients with higher ad spend)
//   Existing clients ↓: -$10,248.00 (7+ clients with lower ad spend)
//   Net:                 -$1,548.00  ≈ -$1,547.88 ✓
//
// Avg ticket (existing only):
//   March  41 clients  $61,510 total  → $1,500/client
//   April  43 existing $52,912 total  → $1,231/client  (-$269, -17.9%)
// ============================================================

export interface BridgeMover {
  display_name: string;
  stripe_id: string | null;
  delta: number;
  batch: string;
  is_new?: boolean;
}

export interface BridgeSegment {
  key: string;
  label: string;    // short label for chart bar
  sublabel: string; // e.g. "+2 new clients"
  delta: number;    // positive or negative
  type: "positive" | "negative";
  movers: BridgeMover[];
}

export interface MoMBridge {
  prior_label: string;
  current_label: string;
  prior_collected: number;
  current_collected: number;
  // Avg ticket for existing clients (excludes new/churned)
  existing_clients_prior: number;    // count
  existing_clients_current: number;  // count
  existing_collected_current: number; // total collected excl. new clients
  segments: BridgeSegment[];
}

export const momBridgeApr2026: MoMBridge = {
  prior_label:    "March 2026",
  current_label:  "April 2026",
  prior_collected:   61_510.24,
  current_collected: 59_962.36,

  // Existing client avg ticket context
  existing_clients_prior:    41,
  existing_clients_current:  43,           // 45 total - 2 new
  existing_collected_current: 52_912.36,   // 59,962.36 - 7,050 new clients

  segments: [
    {
      key:      "new_clients",
      label:    "New clients",
      sublabel: "+2 new clients",
      delta:    7_050.00,
      type:     "positive",
      movers: [
        { display_name: "richie@natcodb.com",        stripe_id: "cus_UJPVLKVt2c4Oh3", delta: 3_500.00, batch: "Consulting", is_new: true },
        { display_name: "ppucheu@pbm-solutions.com", stripe_id: "cus_RyRxOBvhJBvNpE", delta: 3_550.00, batch: "Consulting", is_new: true },
      ],
    },
    {
      key:      "existing_up",
      label:    "Clients ↑",
      sublabel: "3 clients grew",
      delta:    1_650.00,
      type:     "positive",
      movers: [
        { display_name: "Designer Frames Outlet",  stripe_id: "cus_HWgmu82x3l9rCZ", delta:   850.00, batch: "3" },
        { display_name: "KTM Twins",               stripe_id: "cus_GNUYupp8Hh4cSP", delta:   480.00, batch: "1" },
        { display_name: "Mouldings / White River", stripe_id: "cus_EJMKHEPaZ23L9y", delta:   320.00, batch: "2" },
      ],
    },
    {
      key:      "existing_down",
      label:    "Clients ↓",
      sublabel: "7+ clients declined",
      delta:    -10_248.00,
      type:     "negative",
      movers: [
        { display_name: "WIM Group",                  stripe_id: "cus_Gks5Luf2oz80Vv", delta: -3_200.00, batch: "1" },
        { display_name: "sgilly@trility.net",         stripe_id: "cus_Q14kHfVtV7mClW", delta: -1_800.00, batch: "Consulting" },
        { display_name: "Gongs Unlimited",            stripe_id: "cus_PIpVQvQrcL0N9x", delta: -1_600.00, batch: "3" },
        { display_name: "Your Elegant Bar",           stripe_id: "cus_L4vWBzInyrA8RN", delta: -1_100.00, batch: "1" },
        { display_name: "Dallas Designer Handbags",   stripe_id: "cus_QUbjD69JAUgYEI", delta:   -850.00, batch: "2" },
        { display_name: "JRG Supply",                 stripe_id: "cus_PldCRQBIaCoGiO", delta:   -600.00, batch: "3" },
        { display_name: "Others (10 clients)",        stripe_id: null,                  delta: -1_098.00, batch: "—" },
      ],
    },
  ],
};
