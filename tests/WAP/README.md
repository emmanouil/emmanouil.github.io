# We Are Public Events Browser

A web application that fetches and displays events from wearepublic.nl with filtering and sorting capabilities.

## Features

- **Event Fetching**: Retrieves events from wearepublic.nl/alles
- **Filtering**: Filter events by type, location, and date range
- **Sorting**: Sort events by date, title, location, or type
- **Responsive Design**: Works on desktop and mobile devices
- **Real-time Updates**: Filters and sorting update results instantly

## How to Use

1. Open `index.html` in a web browser
2. The application will automatically load events
3. Use the filters to narrow down events:
   - **Event Type**: Filter by category (Music, Theater, Dance, etc.)
   - **Location**: Filter by city or venue
   - **Date Range**: Filter events within specific dates
   - **Sort By**: Change the order of displayed events
4. Click "Reset Filters" to clear all filters
5. Click "Load More Events" to load additional events

## File Structure

```
WAP/
├── index.html      # Main HTML file
├── styles.css      # CSS styling
├── script.js       # JavaScript functionality
└── README.md       # This file
```

## Technical Details

- Built with vanilla JavaScript, HTML, and CSS
- Uses CORS proxy for cross-origin requests
- Responsive grid layout for event display
- Client-side filtering and sorting
- Sample data included for demonstration

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Deployment

Simply upload all files to any web server. The application is completely client-side and requires no server-side processing.

## Notes

- The web scraping functionality uses a CORS proxy to bypass cross-origin restrictions
- For production use, consider implementing a proper backend API to handle requests
- Date parsing for Dutch date formats is simplified and may need enhancement for production use
