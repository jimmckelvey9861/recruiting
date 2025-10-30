# Planning Wireframe V3.2

A sophisticated demand forecasting and workforce planning wireframe built with Vite, React, TypeScript, and Tailwind CSS. This wireframe demonstrates a comprehensive planning dashboard for restaurant staffing with multiple time horizons and role management.

## Features

### 🎯 **Core Planning Dashboard**
- **Multi-Role Management**: Cook, Server, Bartender, Host roles with individual demand/supply tracking
- **Interactive Heatmaps**: Visual coverage analysis with color-coded supply vs demand ratios
- **Multi-Timeframe Views**: Week, Month, and Year perspectives with seamless navigation
- **Real-time Calculations**: Dynamic demand forecasting with realistic restaurant patterns

### 📊 **Advanced Visualizations**
- **Week View**: 48 half-hour slots × 7 days with detailed staffing coverage
- **Month View**: Calendar layout with aggregated coverage patterns per day
- **Year View**: 12-month overview with monthly drill-down capability
- **Color-coded Legend**: Intuitive green/yellow/red system for staffing levels

### 🎨 **Smart UI/UX**
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Context-Aware Navigation**: Location selector and KPI display
- **Interactive Elements**: Click-to-navigate between time periods and views
- **Recruitment Integration**: Direct access to hiring workflows per role

### 🧪 **Built-in Testing**
- **Automated Test Suite**: Color mapping, ratio calculations, date navigation
- **Real-time Validation**: Expandable test panel with pass/fail indicators
- **Edge Case Coverage**: Boundary conditions and month rollover scenarios

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd demand-forecasting-wireframe
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

### Building for Production
```bash
npm run build
```

## Project Architecture

### Core Components

#### `PlanningScreen.tsx`
The main dashboard component featuring:
- **Role Management Panel**: Left sidebar with demand/supply metrics per role
- **Heatmap Visualization**: Central area with time-based coverage analysis  
- **Navigation Controls**: Time period selection and date navigation
- **Recruitment Integration**: Quick access to hiring workflows

#### Key Functions
- `genWeek()`: Generates realistic demand patterns with lunch/dinner peaks
- `cellColor()`: Maps supply/demand ratios to visual color codes
- `classifyDelta()`: Categorizes staffing levels (over/match/short)
- `rollMonth()`: Handles month navigation with year boundaries

### Data Model

```typescript
// Role structure
{
  role: string,
  demand: number,
  supply: number
}

// Time slot data
{
  demand: number,
  supply: number, 
  closed: boolean
}
```

### Color Coding System
- **🟢 Green Variants**: 10%+ overstaffed (light to dark)
- **🟡 Yellow**: Balanced staffing (±5%)
- **🔴 Red Variants**: 10%+ understaffed (light to dark)
- **⚪ Gray**: Closed hours or no demand

## Realistic Business Logic

### Operating Hours
- **Monday-Friday**: 9:00 AM - 9:00 PM
- **Saturday-Sunday**: 10:00 AM - 10:00 PM

### Demand Patterns
- **Lunch Peak**: 12:00 PM (Gaussian distribution)
- **Dinner Peak**: 7:00 PM (Gaussian distribution)  
- **Weekend Boost**: 25% increase in demand
- **Role-based Scaling**: Cook > Server > Bartender > Host

### Staffing Calculations
- **Supply Variance**: ±14% realistic staffing fluctuation
- **Seasonal Trends**: Weekly phase adjustments
- **Coverage Thresholds**: 30%/20%/10% over/under boundaries

## Customization

### Integrating Real Data
1. Replace `genWeek()` with your API data source
2. Update role definitions in the main component
3. Modify operating hours in `isOpen()` function
4. Adjust color thresholds in `cellColor()` function

### Styling Customization
- Colors defined in `COLORS` constant
- Tailwind classes for responsive design
- Grid layouts with CSS Grid for precise control

## Technical Highlights

- **Performance Optimized**: `useMemo` for expensive calculations
- **Type Safe**: Full TypeScript coverage with proper interfaces
- **Accessible**: Semantic HTML with proper ARIA labels
- **Testable**: Comprehensive test suite with boundary validation
- **Maintainable**: Clean separation of concerns and pure functions

## Technologies Used

- **Vite 5.4**: Lightning-fast build tool and dev server
- **React 18**: Modern hooks-based architecture
- **TypeScript 5.6**: Full type safety and IntelliSense
- **Tailwind CSS 3.4**: Utility-first styling framework

## License

MIT License
