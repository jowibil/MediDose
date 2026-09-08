# MediDose

> A simple home medicine management system for organizing medication schedules, tracking inventory, and monitoring expiration dates.

MediDose is a single-page application designed to help households manage their medicines in one convenient place. It provides a dosage intake scheduler, medicine cabinet inventory tracker, and expiration monitoring system while keeping data stored locally on the user's device.

---

## Features

### Smart Intake Scheduler

Organize and track daily medication schedules using different scheduling modes.

* **Waking Hours Mode (Default)**
  Automatically spaces daily doses evenly between the first dose time and **10:00 PM**.

* **Strict Every N Hours Mode**
  Calculates medication intervals based on a full 24-hour cycle. For example:

  * `4 doses per day` → Every `6 hours`
  * `3 doses per day` → Every `8 hours`

* **Custom Specific Times Mode**
  Allows users to manually set the exact time for each daily dose.

* **7-Day Patient Timeline**
  Track medication intake and dose completion across a seven-day period for each family member.

---

### Inventory Ledger

Keep track of medicine stock and monitor available doses.

* Automatically decreases stock when a dose is logged.
* Displays warnings when stock is low (`≤ 5 doses`).
* Identifies medicines that are out of stock.
* Provides quick stock increment and decrement controls.
* Includes restock management controls.

---

### Expiration Alert Board

Monitor medicine shelf life and expiration dates.

Medicines are automatically categorized as:

| Status               | Description                             |
| -------------------- | --------------------------------------- |
| 🟢 **Safe**          | Medicine is not close to expiration     |
| 🟡 **Expiring Soon** | Medicine expires within 30 days         |
| 🔴 **Expired**       | Medicine has passed its expiration date |

Additional features include:

* Automatic expiration status detection.
* Alerts for medicines expiring soon.
* Quick disposal management for expired medicines.

---

### Client-Side Persistence

MediDose prioritizes privacy by storing application data locally.

* Uses `localStorage` for persistent browser storage.
* Includes an in-memory fallback when local storage is unavailable.
* Requires no external backend or database.
* Does not require privacy-invasive tracking.

> **Note:** Clearing browser data or local storage may remove MediDose data.

---

## Tech Stack

| Technology          | Purpose                           |
| ------------------- | --------------------------------- |
| **React 19**        | Frontend framework                |
| **TypeScript**      | Type-safe application development |
| **Vite 8**          | Development server and build tool |
| **Tailwind CSS v4** | Styling and responsive design     |
| **Radix UI**        | Accessible UI primitives          |
| **Lucide React**    | Interface icons                   |
| **Oxlint (Oxc)**    | Code quality and linting          |
| **Fraunces**        | Serif typography                  |
| **IBM Plex Sans**   | Sans-serif typography             |

---

## Design

MediDose uses a custom **Apothecary-inspired design system** focused on clarity, calmness, and readability.

### Typography

* **Fraunces** — Used for headings and prominent text.
* **IBM Plex Sans** — Used for interface elements and body text.

### Design Goals

* Clean and accessible interface.
* Easy medicine management for households.
* Clear visual status indicators.
* Minimal distractions.
* Responsive single-page experience.

---

## Project Structure

```text
medidose/
│
├── src/
│   │
│   ├── components/
│   │   ├── modals/              # Confirmation dialogs
│   │   │
│   │   └── ui/                  # Reusable UI primitives
│   │       ├── Button
│   │       ├── Card
│   │       ├── Input
│   │       └── Tabs
│   │
│   ├── features/
│   │   ├── AddMedicineForm.tsx  # Add medicine form and cabinet list
│   │   ├── ScheduleView.tsx     # Dosage schedules and 7-day timeline
│   │   ├── InventoryLedger.tsx  # Stock management and restocking
│   │   ├── ExpirationBoard.tsx  # Expiration monitoring
│   │   └── WelcomeView.tsx      # Application onboarding
│   │
│   ├── lib/
│   │   ├── dates.ts             # Date utilities and ISO formatting
│   │   ├── inventory.ts         # Inventory thresholds and helpers
│   │   ├── schedule.ts          # Dose scheduling logic
│   │   ├── validation.ts        # Form validation rules
│   │   └── utils.ts             # General utility functions
│   │
│   ├── types/
│   │   └── medicine.ts          # TypeScript interfaces and constants
│   │
│   ├── App.tsx                  # Main application layout and state
│   ├── main.tsx                 # Application entry point
│   └── index.css                # Tailwind styles and design tokens
│
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

---

## Getting Started

### Prerequisites

Make sure you have the following installed:

* Node.js **v18 or later**
* npm, Yarn, or pnpm

### 1. Clone the Repository

```bash
git clone <https://github.com/jowibil/MediDose>
```

### 2. Navigate to the Project

```bash
cd medidose
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Development Server

```bash
npm run dev
```

Open the local URL provided by Vite in your browser.

---

## Build for Production

Create an optimized production build:

```bash
npm run build
```

---

## Preview the Production Build

Preview the production build locally:

```bash
npm run preview
```

---

## How Scheduling Works

### Waking Hours Mode

Daily doses are distributed evenly between the selected first dose time and **10:00 PM**.

Example:

```text
First Dose: 8:00 AM
Frequency: 3 times per day

Generated Schedule:
8:00 AM
3:00 PM
10:00 PM
```

---

### Strict Every N Hours Mode

The application divides a full 24-hour period based on the number of daily doses.

Example:

```text
4 doses per day

24 ÷ 4 = 6 hours

Schedule:
6:00 AM
12:00 PM
6:00 PM
12:00 AM
```

---

### Custom Specific Times Mode

Users can manually define every medication intake time.

Example:

```text
8:00 AM
1:00 PM
8:00 PM
```

---

## Medical Disclaimer

> **MediDose is intended solely as an organizational, inventory management, and medication monitoring tool.**

MediDose does **not**:

* Prescribe medication.
* Diagnose medical conditions.
* Determine appropriate treatment plans.
* Replace professional medical advice.
* Replace instructions provided by a doctor or pharmacist.

Always consult a qualified healthcare professional regarding medications, prescriptions, dosages, treatment plans, and medical concerns.

Users are responsible for ensuring that all medication information entered into the application is accurate.

---

## Privacy

MediDose is designed with privacy in mind.

* Medicine information is stored locally in the user's browser.
* No external database is required.
* No personal medical information is sent to an external server by default.
* No privacy-invasive tracking is required.

---

<div align="center">

**Made with 💊 for simpler home medicine management.**

</div>
