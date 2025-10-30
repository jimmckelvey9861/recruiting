# Demand Forecasting Wireframe

A comprehensive wireframe for a demand forecasting application built with Vite, React, TypeScript, and Tailwind CSS.

## Features

- **Multi-timeframe Heatmaps**: Interactive heatmaps for week, month, and year views
- **Demand Analytics**: Visualize demand patterns across different time horizons
- **Recruitment Planning**: Capacity planning and gap analysis
- **Model Testing Panel**: Monitor model performance with various tests
- **Responsive Design**: Built with Tailwind CSS for mobile-first design

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

Or use the provided script:
```bash
./start-dev.sh
```

4. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

## Project Structure

```
src/
├── PlanningScreen.tsx    # Main wireframe component
├── App.tsx              # Root component
├── index.css            # Tailwind CSS imports
└── main.tsx             # Application entry point
```

## Components

### PlanningScreen

The main component that includes:

- **Heatmap Visualization**: Interactive grid showing demand patterns
- **Time Period Tabs**: Switch between week, month, and year views
- **Recruitment Panel**: Shows capacity vs demand gap analysis
- **Testing Panel**: Model validation and performance metrics
- **Quick Stats**: Summary statistics and key metrics

## Technologies Used

- **Vite**: Fast build tool and development server
- **React 18**: UI library with hooks
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS**: Utility-first CSS framework

## Customization

The wireframe uses mock data for demonstration. To integrate with real data:

1. Replace the `generateHeatmapData` function with your data source
2. Update the API endpoints in the component
3. Modify the data structures to match your backend schema

## License

MIT License
