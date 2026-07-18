// Canonical logistics job-role data — the single source of truth for:
//   - the signup.html category + role picker
//   - the Check Your Eligibility page (qualify.html)
//   - the /logistics-rewards/:slug SEO landing pages and sitemap.xml
// Add a role here once and it appears everywhere automatically.

const categories = [
  {
    name: 'Warehousing & Storage Operations',
    roles: [
      'Warehouse Operative', 'Warehouse Supervisor', 'Warehouse Manager', 'Warehouse Team Leader',
      'Forklift Driver', 'Reach Truck Driver', 'VNA Driver', 'Picker Packer', 'Loading Bay Operative',
      'Shunter Driver', 'Warehouse Administrator', 'Warehouse Planner', 'Warehouse Quality Inspector',
      'Warehouse Health & Safety Officer', 'Warehouse Trainer', 'Warehouse Operative (Nights)', 'Goods In Operative', 'Goods Out Operative',
    ],
  },
  {
    name: 'Road Freight & Haulage',
    roles: [
      'Truck Driver', 'HGV Class 1 Driver', 'HGV Class 2 Driver', '7.5 Tonne Driver', 'Van Driver',
      'Multi-Drop Driver', 'Tanker Driver', 'ADR Driver', 'Recovery Driver', 'Driver Trainer',
      'LGV Instructor', 'Articulated Lorry Driver', 'Class 1 Driver (Days)', 'Class 1 Driver (Nights)',
      'Owner Driver', 'Haulage Contractor',
    ],
  },
  {
    name: 'Transport Management',
    roles: [
      'Transport Planner', 'Transport Manager', 'Transport Supervisor', 'Transport Compliance Officer',
      'Route Optimisation Analyst', 'Transport Clerk', 'Transport Operations Manager',
      'Traffic Office Manager', 'Fuel & Compliance Analyst',
    ],
  },
  {
    name: 'Fleet Management',
    roles: [
      'Fleet Manager', 'Fleet Administrator', 'Fleet Maintenance Manager', 'Vehicle Maintenance Controller',
      'Workshop Manager', 'Truck Mechanic', 'Truck Technician', 'Truck Finisher', 'Fleet Engineer',
      'Vehicle Inspector', 'HGV Technician', 'Tyre Fitter',
    ],
  },
  {
    name: 'Courier & Parcel Delivery',
    roles: [
      'Courier', 'Same-Day Courier', 'Self-Employed Courier', 'Courier Driver', 'Multi-Drop Courier',
      'Courier Fleet Coordinator', 'Parcel Delivery Driver',
    ],
  },
  {
    name: 'Last-Mile Delivery',
    roles: [
      'Delivery Associate', 'Last-Mile Coordinator', 'Last-Mile Delivery Driver', 'Delivery Route Planner',
      'Final Mile Operations Manager', 'Delivery Partner',
    ],
  },
  {
    name: 'Air Freight & Aviation Logistics',
    roles: [
      'Air Cargo Handler', 'Air Freight Coordinator', 'Air Freight Agent', 'Ramp Agent', 'Cargo Screener',
      'Airside Operative', 'Aviation Logistics Officer', 'Dangerous Goods Coordinator (Air)',
      'Air Cargo Supervisor', 'Air Cargo Planner',
    ],
  },
  {
    name: 'Sea Freight & Ocean Shipping',
    roles: [
      'Port Operative', 'Port Supervisor', 'Container Terminal Operative', 'Vessel Planner',
      'Marine Cargo Coordinator', 'Shipping Clerk', 'Shipping Coordinator', 'Dockside Operative',
      'Marine Logistics Planner', 'Maritime Compliance Officer',
    ],
  },
  {
    name: 'Rail Freight Logistics',
    roles: [
      'Rail Freight Operative', 'Rail Planner', 'Rail Operations Controller', 'Rail Yard Operative',
      'Rail Cargo Coordinator', 'Rail Terminal Supervisor', 'Rail Logistics Manager', 'Rail Safety Officer',
      'Rail Load Planner', 'Rail Compliance Officer',
    ],
  },
  {
    name: 'Freight Forwarding',
    roles: [
      'Freight Forwarder', 'Freight Coordinator', 'Freight Operations Manager', 'Freight Forwarding Agent',
      'Freight Sales Executive', 'Freight Broker', 'International Freight Coordinator',
    ],
  },
  {
    name: 'Third-Party Logistics (3PL)',
    roles: [
      '3PL Account Manager', '3PL Operations Manager', 'Contract Logistics Manager',
      'Client Services Manager (3PL)', 'Warehouse Contract Manager',
    ],
  },
  {
    name: 'Fourth-Party Logistics (4PL) & Supply Chain Management',
    roles: [
      'Supply Chain Analyst', 'Supply Chain Planner', 'Supply Chain Manager', 'Supply Chain Director',
      '4PL Manager', 'Supply Chain Coordinator',
    ],
  },
  {
    name: 'Customs, Import & Export Compliance',
    roles: [
      'Customs Clerk', 'Customs Compliance Officer', 'Import Coordinator', 'Export Coordinator',
      'Customs Broker', 'Trade Compliance Officer', 'Import/Export Administrator',
    ],
  },
  {
    name: 'Procurement & Supply Chain Planning',
    roles: [
      'Procurement Officer', 'Procurement Manager', 'Demand Planner', 'Materials Planner',
      'Category Manager (Procurement)', 'Buyer', 'Senior Buyer', 'Procurement Analyst',
    ],
  },
  {
    name: 'Inventory Management & Stock Control',
    roles: [
      'Inventory Controller', 'Inventory Analyst', 'Inventory Manager', 'Stock Auditor',
      'Stock Controller', 'Stock Control Manager', 'Cycle Counter', 'Inventory Planner',
    ],
  },
  {
    name: 'E-Commerce Fulfilment',
    roles: [
      'E-Commerce Fulfilment Operative', 'Pick-to-Light Operative', 'Sortation Operative', 'Parcel Sorter',
      'Fulfilment Centre Operative', 'Fulfilment Manager', 'Online Order Picker',
    ],
  },
  {
    name: 'Cold Chain & Temperature-Controlled Logistics',
    roles: [
      'Cold Chain Operative', 'Refrigerated Transport Driver', 'Temperature-Controlled Warehouse Operative',
      'Cold Store Manager', 'Cold Chain Compliance Officer', 'Chilled Distribution Driver',
      'Frozen Goods Warehouse Operative',
    ],
  },
  {
    name: 'Pharmaceutical & Healthcare Logistics',
    roles: [
      'Pharmaceutical Warehouse Operative', 'Healthcare Logistics Coordinator',
      'Medical Supplies Distribution Driver', 'GDP Compliance Officer', 'Pharma Cold Chain Specialist',
      'Clinical Trials Logistics Coordinator',
    ],
  },
  {
    name: 'Automotive & Manufacturing Logistics',
    roles: [
      'Automotive Logistics Coordinator', 'Just-In-Time Delivery Driver', 'Manufacturing Logistics Planner',
      'Parts Distribution Operative', 'Production Line Supply Operative', 'Vehicle Finishing Operative',
    ],
  },
  {
    name: 'Industrial, Construction & Heavy Goods Logistics',
    roles: [
      'Heavy Goods Driver', 'Plant Delivery Driver', 'Construction Logistics Coordinator',
      'Site Logistics Manager', 'Abnormal Loads Driver', 'Crane Operator (Logistics)',
      'Materials Handling Operative',
    ],
  },
  {
    name: 'Reverse Logistics, Returns & Recycling',
    roles: [
      'Returns Processor', 'Returns Coordinator', 'Reverse Logistics Manager', 'Recycling Operative',
      'Waste & Recycling Coordinator', 'Refurbishment Operative',
    ],
  },
  {
    name: 'Relocation & Removals Logistics',
    roles: [
      'Removals Driver', 'Removals Operative', 'Relocation Coordinator', 'Man and Van Driver',
      'Removals Team Leader', 'Storage & Removals Manager',
    ],
  },
  {
    name: 'Packaging & Pallet Management',
    roles: [
      'Packaging Operative', 'Pallet Controller', 'Packing Line Supervisor', 'Packaging Manager',
      'Pallet Network Coordinator',
    ],
  },
  {
    name: 'Logistics Technology & Software (TMS/WMS/Automation)',
    roles: [
      'IT Manager', 'IT Support Engineer', 'Software Developer', 'Systems Analyst', 'Data Analyst',
      'Business Analyst', 'Digital Transformation Manager', 'Head of Technology', 'WMS Administrator',
      'TMS Analyst', 'Warehouse Automation Engineer',
    ],
  },
  {
    name: 'Supply Chain Analytics & Consulting',
    roles: [
      'Logistics Consultant', 'Supply Chain Data Analyst', 'Network Design Analyst',
      'Supply Chain Strategy Manager',
    ],
  },
  {
    name: 'Dangerous Goods & Hazardous Materials Logistics',
    roles: [
      'ADR Compliance Officer', 'Hazmat Driver', 'Dangerous Goods Safety Adviser (DGSA)',
      'Hazardous Waste Coordinator',
    ],
  },
  {
    name: 'Food & Beverage Logistics',
    roles: [
      'Food Distribution Driver', 'Beverage Delivery Driver', 'Food Warehouse Operative',
      'Food Safety & Compliance Officer', 'FMCG Logistics Coordinator',
    ],
  },
  {
    name: 'Retail Distribution Logistics',
    roles: [
      'Distribution Centre Operative', 'Distribution Manager', 'Distribution Supervisor', 'Hub Manager',
      'Hub Operative', 'Depot Manager', 'Depot Supervisor', 'Retail Replenishment Coordinator',
      'Store Delivery Driver',
    ],
  },
  {
    name: 'International Trade Logistics',
    roles: [
      'International Trade Coordinator', 'Export Sales Logistics Coordinator', 'Global Logistics Manager',
      'International Shipping Coordinator',
    ],
  },
  {
    name: 'Port, Terminal & Cargo Handling Operations',
    roles: [
      'Terminal Operative', 'Crane Operator (Port)', 'Stevedore', 'Cargo Handling Supervisor',
      'Container Yard Planner', 'Terminal Manager',
    ],
  },
  {
    name: 'Corporate, Leadership & Executive Roles',
    roles: [
      'Chief Executive Officer (CEO)', 'Chief Operating Officer (COO)', 'Chief Financial Officer (CFO)',
      'Chief Technology Officer (CTO)', 'Chief Information Officer (CIO)', 'Chief Marketing Officer (CMO)',
      'Chief People Officer (CHRO)', 'Chief Commercial Officer (CCO)', 'Chief Sustainability Officer',
      'Managing Director', 'Founder', 'Co-Founder', 'Investor', 'Non-Executive Director', 'Chairperson',
      'Board Member', 'Operations Director', 'Commercial Director', 'Technical Director',
      'HR Manager (Logistics)', 'HR Business Partner (Logistics)', 'HR Advisor (Logistics)',
      'HR Administrator (Logistics)', 'Talent Acquisition Specialist (Logistics)',
      'Recruitment Consultant (Transport & Logistics)', 'Payroll Administrator (Logistics)',
      'Finance Manager (Logistics)', 'Finance Business Partner (Logistics)', 'Commercial Manager (Logistics)',
      'Compliance Manager', 'Health & Safety Manager', 'Quality Assurance Manager (Logistics)',
      'Sustainability Manager (Logistics)',
    ],
  },
];

function slugify(str) {
  return str.toLowerCase()
    .replace(/[()/&]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Flat lookup: slug -> { role, category }
const roleBySlug = {};
for (const category of categories) {
  for (const role of category.roles) {
    roleBySlug[slugify(role)] = { role, category: category.name };
  }
}

module.exports = { categories, slugify, roleBySlug };
