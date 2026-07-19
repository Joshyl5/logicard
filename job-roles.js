// Canonical logistics job-role data — the single source of truth for:
//   - the signup.html category + role picker
//   - the Check Your Eligibility page (qualify.html)
//   - the /logistics-rewards/:slug SEO landing pages and sitemap.xml
// Add a role here once and it appears everywhere automatically.
// Categories are kept in alphabetical order (note: "3PL" sorts before "A"
// under standard alphabetical/ASCII ordering, since digits precede letters).

const categories = [
  {
    name: '3PL',
    roles: [
      '3PL Account Manager', '3PL Operations Manager', 'Contract Logistics Manager',
      'Client Services Manager (3PL)', 'Warehouse Contract Manager', '4PL Manager',
      'Freight Forwarder', 'Freight Coordinator', 'Freight Operations Manager',
      'Freight Forwarding Agent', 'Freight Sales Executive', 'Freight Broker',
      'International Freight Coordinator',
    ],
  },
  {
    name: 'Air Freight',
    roles: [
      'Air Cargo Handler', 'Air Freight Coordinator', 'Air Freight Agent', 'Ramp Agent',
      'Cargo Screener', 'Airside Operative', 'Aviation Logistics Officer',
      'Dangerous Goods Coordinator (Air)', 'Air Cargo Supervisor', 'Air Cargo Planner',
    ],
  },
  {
    name: 'Business Services',
    roles: [
      'Customer Service Advisor (Logistics)', 'Customer Service Manager (Logistics)',
      'Sales Executive (Logistics)', 'Business Development Manager (Logistics)',
      'Account Manager (Logistics)', 'Administrative Assistant (Logistics)',
      'Office Manager (Logistics)', 'Receptionist (Logistics)', 'Marketing Manager (Logistics)',
      'Legal Counsel (Logistics)',
    ],
  },
  {
    name: 'Customs',
    roles: [
      'Customs Clerk', 'Customs Compliance Officer', 'Import Coordinator', 'Export Coordinator',
      'Customs Broker', 'Trade Compliance Officer', 'Import/Export Administrator',
      'International Trade Coordinator', 'Export Sales Logistics Coordinator',
    ],
  },
  {
    name: 'E-Commerce',
    roles: [
      'E-Commerce Fulfilment Operative', 'Pick-to-Light Operative', 'Sortation Operative',
      'Parcel Sorter', 'Fulfilment Centre Operative', 'Fulfilment Manager', 'Online Order Picker',
      'E-Commerce Logistics Manager', 'Marketplace Fulfilment Coordinator', 'Click & Collect Operative',
    ],
  },
  {
    name: 'Finance',
    roles: [
      'Finance Manager (Logistics)', 'Finance Business Partner (Logistics)', 'Finance Analyst (Logistics)',
      'Credit Controller (Logistics)', 'Accounts Payable Clerk (Logistics)', 'Freight Cost Analyst',
      'Billing Coordinator (Logistics)', 'Finance Director (Logistics)',
    ],
  },
  {
    name: 'Fleet Management',
    roles: [
      'Fleet Manager', 'Fleet Administrator', 'Fleet Maintenance Manager',
      'Vehicle Maintenance Controller', 'Workshop Manager', 'Truck Mechanic',
      'Truck Technician', 'Truck Finisher', 'Fleet Engineer', 'Vehicle Inspector',
      'HGV Technician', 'Tyre Fitter',
    ],
  },
  {
    name: 'HR',
    roles: [
      'HR Manager (Logistics)', 'HR Business Partner (Logistics)', 'HR Advisor (Logistics)',
      'HR Administrator (Logistics)', 'Talent Acquisition Specialist (Logistics)',
      'Recruitment Consultant (Transport & Logistics)', 'Payroll Administrator (Logistics)',
    ],
  },
  {
    name: 'Logistics Charity',
    roles: [
      'Charity Logistics Coordinator', 'Humanitarian Logistics Officer', 'Disaster Relief Logistics Manager',
      'Food Bank Distribution Coordinator', 'Charity Warehouse Volunteer Coordinator',
      'NGO Supply Chain Officer', 'Aid Logistics Officer', 'Community Transport Coordinator',
    ],
  },
  {
    name: 'Management',
    roles: [
      'Chief Executive Officer (CEO)', 'Chief Operating Officer (COO)', 'Chief Financial Officer (CFO)',
      'Chief Technology Officer (CTO)', 'Chief Information Officer (CIO)', 'Chief Marketing Officer (CMO)',
      'Chief People Officer (CHRO)', 'Chief Commercial Officer (CCO)', 'Chief Sustainability Officer',
      'Managing Director', 'Founder', 'Co-Founder', 'Investor', 'Non-Executive Director',
      'Chairperson', 'Board Member', 'Operations Director', 'Commercial Director', 'Technical Director',
      'Commercial Manager (Logistics)', 'Compliance Manager', 'Health & Safety Manager',
      'Quality Assurance Manager (Logistics)', 'Sustainability Manager (Logistics)', 'Global Logistics Manager',
    ],
  },
  {
    name: 'Operations',
    roles: [
      'Operations Manager', 'Operations Coordinator', 'Healthcare Logistics Coordinator',
      'Clinical Trials Logistics Coordinator', 'Automotive Logistics Coordinator',
      'Manufacturing Logistics Planner', 'Parts Distribution Operative', 'Production Line Supply Operative',
      'Construction Logistics Coordinator', 'Site Logistics Manager', 'Crane Operator (Logistics)',
      'Materials Handling Operative', 'Returns Processor', 'Returns Coordinator', 'Reverse Logistics Manager',
      'Recycling Operative', 'Waste & Recycling Coordinator', 'Refurbishment Operative',
      'Food Safety & Compliance Officer', 'FMCG Logistics Coordinator', 'Distribution Manager',
      'Distribution Supervisor', 'Hub Manager', 'Hub Operative', 'Depot Manager', 'Depot Supervisor',
      'Retail Replenishment Coordinator', 'GDP Compliance Officer', 'ADR Compliance Officer',
      'Dangerous Goods Safety Adviser (DGSA)', 'Hazardous Waste Coordinator',
    ],
  },
  {
    name: 'Procurement',
    roles: [
      'Procurement Officer', 'Procurement Manager', 'Demand Planner', 'Materials Planner',
      'Category Manager (Procurement)', 'Buyer', 'Senior Buyer', 'Procurement Analyst',
    ],
  },
  {
    name: 'Rail Freight',
    roles: [
      'Rail Freight Operative', 'Rail Planner', 'Rail Operations Controller', 'Rail Yard Operative',
      'Rail Cargo Coordinator', 'Rail Terminal Supervisor', 'Rail Logistics Manager', 'Rail Safety Officer',
      'Rail Load Planner', 'Rail Compliance Officer',
    ],
  },
  {
    name: 'Sea Freight',
    roles: [
      'Port Operative', 'Port Supervisor', 'Container Terminal Operative', 'Vessel Planner',
      'Marine Cargo Coordinator', 'Shipping Clerk', 'Shipping Coordinator', 'Dockside Operative',
      'Marine Logistics Planner', 'Maritime Compliance Officer', 'Terminal Operative',
      'Crane Operator (Port)', 'Stevedore', 'Cargo Handling Supervisor', 'Container Yard Planner',
      'Terminal Manager', 'International Shipping Coordinator',
    ],
  },
  {
    name: 'Security',
    roles: [
      'Security Officer', 'Security Guard', 'Site Security Supervisor', 'Warehouse Security Officer',
      'CCTV Operator', 'Access Control Officer', 'Security Manager', 'Loss Prevention Officer',
      'Cargo Security Officer', 'Port Security Officer',
    ],
  },
  {
    name: 'Self Employed',
    roles: [
      'Self-Employed Courier', 'Owner Driver', 'Independent Haulier', 'Self-Employed Delivery Driver',
      'Freelance Logistics Consultant', 'Sole Trader Removals', 'Self-Employed Warehouse Contractor',
      'Owner-Operator (HGV)',
    ],
  },
  {
    name: 'Stock Control',
    roles: [
      'Inventory Controller', 'Inventory Analyst', 'Inventory Manager', 'Stock Auditor',
      'Stock Controller', 'Stock Control Manager', 'Cycle Counter', 'Inventory Planner',
    ],
  },
  {
    name: 'Supply Chain',
    roles: [
      'Supply Chain Manager', 'Supply Chain Director', 'Supply Chain Analyst', 'Supply Chain Planner',
      'Supply Chain Coordinator', 'Supply Chain Strategy Manager', 'Supply Chain Data Analyst',
      'Network Design Analyst', 'Logistics Consultant', 'S&OP Manager', 'Supply Chain Risk Manager',
      'End-to-End Supply Chain Planner',
    ],
  },
  {
    name: 'Technology',
    roles: [
      'IT Manager', 'IT Support Engineer', 'Software Developer', 'Systems Analyst', 'Data Analyst',
      'Business Analyst', 'Digital Transformation Manager', 'Head of Technology', 'WMS Administrator',
      'TMS Analyst', 'Warehouse Automation Engineer',
    ],
  },
  {
    name: 'Transport',
    roles: [
      'Truck Driver', 'HGV Class 1 Driver', 'HGV Class 2 Driver', '7.5 Tonne Driver', 'Van Driver',
      'Multi-Drop Driver', 'Tanker Driver', 'ADR Driver', 'Recovery Driver', 'Driver Trainer',
      'LGV Instructor', 'Articulated Lorry Driver', 'Class 1 Driver (Days)', 'Class 1 Driver (Nights)',
      'Haulage Contractor', 'Transport Planner', 'Transport Manager', 'Transport Supervisor',
      'Transport Compliance Officer', 'Route Optimisation Analyst', 'Transport Clerk',
      'Transport Operations Manager', 'Traffic Office Manager', 'Fuel & Compliance Analyst', 'Courier',
      'Same-Day Courier', 'Courier Driver', 'Multi-Drop Courier', 'Courier Fleet Coordinator',
      'Parcel Delivery Driver', 'Delivery Associate', 'Last-Mile Coordinator', 'Last-Mile Delivery Driver',
      'Delivery Route Planner', 'Final Mile Operations Manager', 'Delivery Partner',
      'Refrigerated Transport Driver', 'Chilled Distribution Driver', 'Medical Supplies Distribution Driver',
      'Just-In-Time Delivery Driver', 'Heavy Goods Driver', 'Plant Delivery Driver', 'Abnormal Loads Driver',
      'Removals Driver', 'Removals Operative', 'Relocation Coordinator', 'Man and Van Driver',
      'Removals Team Leader', 'Storage & Removals Manager', 'Hazmat Driver', 'Food Distribution Driver',
      'Beverage Delivery Driver', 'Store Delivery Driver',
    ],
  },
  {
    name: 'Warehousing',
    roles: [
      'Warehouse Operative', 'Warehouse Supervisor', 'Warehouse Manager', 'Warehouse Team Leader',
      'Forklift Driver', 'Reach Truck Driver', 'VNA Driver', 'Picker Packer', 'Loading Bay Operative',
      'Shunter Driver', 'Warehouse Administrator', 'Warehouse Planner', 'Warehouse Quality Inspector',
      'Warehouse Health & Safety Officer', 'Warehouse Trainer', 'Warehouse Operative (Nights)',
      'Goods In Operative', 'Goods Out Operative', 'Cold Chain Operative',
      'Temperature-Controlled Warehouse Operative', 'Cold Store Manager', 'Cold Chain Compliance Officer',
      'Frozen Goods Warehouse Operative', 'Pharmaceutical Warehouse Operative', 'Pharma Cold Chain Specialist',
      'Food Warehouse Operative', 'Packaging Operative', 'Pallet Controller', 'Packing Line Supervisor',
      'Packaging Manager', 'Pallet Network Coordinator', 'Distribution Centre Operative',
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
