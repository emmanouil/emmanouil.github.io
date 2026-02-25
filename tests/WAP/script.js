class WeArePublicScraper {
    constructor() {
        this.events = [];
        this.filteredEvents = [];
        this.isLoading = false;

        this.initializeApp();
    }

    async initializeApp() {
        this.setupEventListeners();
        await this.loadEvents();
        this.updateFilters();
        this.filterAndRender(); // Make sure to apply filters and render
    }

    setupEventListeners() {
        document.getElementById('eventType').addEventListener('change', () => this.filterAndRender());
        document.getElementById('location').addEventListener('change', () => this.filterAndRender());
        document.getElementById('dateFrom').addEventListener('change', () => this.filterAndRender());
        document.getElementById('dateTo').addEventListener('change', () => this.filterAndRender());
        document.getElementById('sortBy').addEventListener('change', () => this.filterAndRender());
        document.getElementById('resetFilters').addEventListener('click', () => this.resetFilters());
    }

    async loadEvents() {
        this.showLoading(true);

        try {
            // Try multiple approaches to get events data

            // Approach 1: Try to fetch from potential API endpoints
            const apiEndpoints = [
                'https://wearepublic.nl/api/events',
                'https://wearepublic.nl/api/programma',
                'https://wearepublic.nl/events.json',
                'https://wearepublic.nl/programma.json',
                'https://wearepublic.nl/api/v1/events',
                'https://wearepublic.nl/wp-json/wp/v2/events'
            ];

            // Approach 2: Fallback to HTML scraping if API fails
            const proxies = [
                { url: 'https://corsproxy.io/?', format: 'prefix' },
                { url: 'https://api.allorigins.win/raw?url=', format: 'prefix' },
                { url: 'https://cors-anywhere.herokuapp.com/', format: 'prefix' },
                { url: 'https://api.codetabs.com/v1/proxy?quest=', format: 'prefix' }
            ];

            let eventsData = null;
            let lastError = null;

            // First try API endpoints
            for (const endpoint of apiEndpoints) {
                try {
                    console.log('Trying API endpoint:', endpoint);
                    const response = await fetch(endpoint);
                    if (response.ok) {
                        eventsData = await response.json();
                        console.log('Successfully fetched from API');
                        this.parseApiEvents(eventsData);
                        this.showLoading(false);
                        return;
                    }
                } catch (error) {
                    console.warn(`API endpoint failed: ${endpoint}`, error.message);
                }
            }

            // If API fails, fallback to HTML scraping
            console.log('API endpoints failed, falling back to HTML scraping');
            let html = '';

            // Use cors-anywhere as default
            const targetUrl = 'https://www.wearepublic.nl/alles';
            const corsAnywhereUrl = 'https://cors-anywhere.herokuapp.com/' + targetUrl;

            try {
                console.log('Trying cors-anywhere:', corsAnywhereUrl);
                const response = await fetch(corsAnywhereUrl);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                html = await response.text();
                console.log('Successfully fetched HTML, length:', html.length);

            } catch (error) {
                console.warn('CORS-anywhere failed:', error.message);

                // Fallback to other proxies
                for (const proxy of proxies.filter(p => p.url !== 'https://cors-anywhere.herokuapp.com/')) {
                    try {
                        const fullUrl = proxy.format === 'prefix' ? proxy.url + encodeURIComponent(targetUrl) : targetUrl;
                        console.log('Trying fallback proxy:', proxy.url);

                        const response = await fetch(fullUrl);

                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }

                        html = await response.text();
                        console.log('Successfully fetched HTML, length:', html.length);
                        break; // Success, break out of the loop

                    } catch (fallbackError) {
                        console.warn(`Fallback proxy failed: ${proxy.url}`, fallbackError.message);
                        lastError = fallbackError;
                    }
                }
            }

            if (!html) {
                throw new Error(`All proxies failed. Last error: ${lastError?.message}`);
            }

            this.parseEvents(html);
            this.showLoading(false);
        } catch (error) {
            console.error('Error loading events:', error);
            this.showError(`Failed to load events: ${error.message}. The CORS proxies may be rate-limited. Try refreshing the page in a few minutes.`);
            this.showLoading(false);
        }
    }

    parseApiEvents(apiData) {
        console.log('Parsing API data:', apiData);

        // Clear previous events
        this.events = [];

        // Handle different API response formats
        let eventsArray = [];

        if (Array.isArray(apiData)) {
            eventsArray = apiData;
        } else if (apiData && apiData.events) {
            eventsArray = apiData.events;
        } else if (apiData && apiData.data) {
            eventsArray = apiData.data;
        } else {
            console.warn('Unknown API format, trying to extract events');
            // Try to find events in the response object
            for (const key in apiData) {
                if (Array.isArray(apiData[key]) && apiData[key].length > 0) {
                    eventsArray = apiData[key];
                    break;
                }
            }
        }

        if (eventsArray.length === 0) {
            console.warn('No events found in API response');
            return;
        }

        console.log('Found', eventsArray.length, 'events in API response');

        eventsArray.forEach(eventData => {
            const event = this.parseApiEvent(eventData);
            if (event) {
                this.events.push(event);
            }
        });

        console.log(`Successfully parsed ${this.events.length} events from API`);
        this.updateFilters();
        this.filterAndRender();
    }

    parseApiEvent(eventData) {
        try {
            // Extract data from API response
            const title = eventData.title || eventData.name || eventData.event_title || '';
            const date = eventData.date || eventData.start_date || eventData.datetime || 'Date not specified';
            const location = eventData.location || eventData.venue || eventData.place || 'Location not specified';
            const city = eventData.city || this.extractCity(location);
            const type = eventData.type || eventData.category || eventData.genre || 'Other';
            const artists = eventData.artists || eventData.performers || eventData.artist || '';

            if (!title || !date) {
                return null;
            }

            return {
                id: eventData.id || Date.now() + Math.random(),
                title: title,
                date: date,
                location: location,
                city: city,
                type: type,
                artists: artists,
                isFeatured: eventData.featured || title.includes('⭑'),
                dateAdded: new Date().toISOString().split('T')[0]
            };
        } catch (error) {
            console.error('Error parsing API event:', error);
            return null;
        }
    }

    parseEvents(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        console.log('Parsing HTML content...');

        // Clear previous events
        this.events = [];

        // Debug: search for any elements containing event-related text
        const allElements = doc.querySelectorAll('*');
        const eventLikeElements = [];

        allElements.forEach(element => {
            const text = element.textContent || '';

            // Skip JavaScript code and other invalid content
            if (text.includes('window.__NUXT__') || text.includes('script') || text.includes('function') ||
                text.includes('var ') || text.includes('const ') || text.includes('let ')) {
                return;
            }

            // More permissive criteria to catch more events
            if (text.length > 20 &&
                (/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)/i.test(text) ||
                 /(Beeldende Kunst|Film|Dans|Theater|Muziek|Performance|Architectuur)/i.test(text) ||
                 /(Amsterdam|Den Haag|Rotterdam|Utrecht|Eindhoven|Groningen|Maastricht|Arnhem|Den Bosch)/i.test(text))) {
                eventLikeElements.push(element);
            }
        });

        console.log('Found', eventLikeElements.length, 'event-like elements by text content');

        // Use the text-based approach since it found many more potential events
        let eventElements;
        if (eventLikeElements.length > 10) {
            console.log('Using text-based approach:', eventLikeElements.length, 'elements');
            eventElements = eventLikeElements;
        } else {
            // Fallback to container approach
            const eventsContainer = doc.querySelector('.event-list, [class*="event"], [class*="programma"], .programma-lijst');
            if (eventsContainer) {
                eventElements = eventsContainer.querySelectorAll('.event-item, [class*="item"], li, div, article');
                console.log('Using container approach:', eventElements.length, 'elements');
            } else {
                eventElements = doc.querySelectorAll('.event-item, [class*="event"], [class*="item"], li, div, article');
            }
        }

        console.log('Found', eventElements.length, 'event elements');

        // Debug: log the first few elements to see what we're working with
        eventElements.forEach((element, index) => {
            if (index < 5) {
                console.log(`Element ${index}:`, element.outerHTML.substring(0, 200));
            }
        });

        let parsedCount = 0;

        eventElements.forEach((element, index) => {
            let event = this.parseEventElementStructured(element);

            // If structured parsing fails, try the old method
            if (!event || !event.title || event.title === 'Untitled Event') {
                console.log('Structured parsing failed, trying fallback for element:', index);
                event = this.parseEventElement(element);
            }

            if (event && event.title && event.title !== 'Untitled Event') {
                // Check for duplicates by title AND date AND city (all must match)
                const isDuplicate = this.events.some(existing =>
                    existing.title === event.title &&
                    existing.date === event.date &&
                    existing.city === event.city
                );

                if (!isDuplicate) {
                    this.events.push(event);
                    parsedCount++;
                    console.log('Added event:', event.title, event.type, event.city, event.date);
                } else {
                    console.log('Skipped duplicate:', event.title, event.city, event.date);
                }
            }
        });

        console.log(`Successfully parsed ${parsedCount} unique events`);

        if (this.events.length === 0) {
            this.showError('No events found. The website structure may have changed.');
        }
    }

    parseEventElementStructured(element) {
        try {
            const text = element.textContent || '';

            // If this element doesn't have enough content, skip it
            if (text.length < 30) return null;

            // Try multiple approaches to extract data

            // Approach 1: Use specific class selectors
            const categoryElement = element.querySelector('.event-category, [class*="category"], [class*="categorie"]');
            const dateElement = element.querySelector('.event-date, [class*="date"], [class*="datum"]');
            const titleElement = element.querySelector('.event-title, [class*="title"], [class*="titel"], h1, h2, h3, h4, strong, b');
            const artistsElement = element.querySelector('.event-artists, [class*="artist"], [class*="performer"]');
            const locationElement = element.querySelector('.event-location, [class*="location"], [class*="venue"], [class*="locatie"]');
            const metaElement = element.querySelector('.event-meta, [class*="meta"]');

            // Extract data using the actual structure
            let eventType = categoryElement ? categoryElement.textContent.trim() : '';
            let date = dateElement ? dateElement.textContent.trim() : '';
            let title = titleElement ? titleElement.textContent.trim() : '';
            let artists = artistsElement ? artistsElement.textContent.trim() : '';
            let location = locationElement ? locationElement.textContent.trim() : '';
            let festival = metaElement ? metaElement.textContent.trim() : '';

            // Debug: log what we found
            if (categoryElement) console.log('Found category element:', eventType);
            if (dateElement) console.log('Found date element:', date);
            if (titleElement) console.log('Found title element:', title);

            // Clean up the extracted data
            if (eventType && eventType.length > 50) {
                // If eventType is too long, it's probably corrupted - reset it
                eventType = '';
            }

            // Approach 2: If structured parsing fails, try text-based extraction
            if (!title || !date) {
                const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

                // Look for title (usually the most prominent text)
                if (!title) {
                    for (let i = 0; i < Math.min(3, lines.length); i++) {
                        const line = lines[i];
                        if (line && line.length > 5 && !/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)/i.test(line)) {
                            title = line;
                            break;
                        }
                    }
                }

                // Look for date
                if (!date) {
                    const dateMatch = text.match(/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)[^.]*\d{1,2}\s+\w+\.?\s+\d{4}/) ||
                                    text.match(/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)[^.]*\d{1,2}:\d{2}/) ||
                                    text.match(/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)[^.]*\d{1,2}\s+\w+\.?/);
                    date = dateMatch ? dateMatch[0].trim() : 'Date not specified';
                }

                // Look for location
                if (!location) {
                    const locationMatch = text.match(/(Amsterdam|Den Haag|Rotterdam|Utrecht|Eindhoven|Groningen|Maastricht|Arnhem|Den Bosch|Haarlem|Leiden|Delft|Tilburg|Breda|Nijmegen|Enschede|Zwolle|Leeuwarden|Almere|Lelystad|Apeldoorn|Amersfoort|Waalwijk)[^,]*/i);
                    location = locationMatch ? locationMatch[0].trim() : 'Location not specified';
                }

                // Look for event type - be more aggressive and precise
                if (!eventType) {
                    // First try to find exact type matches
                    const typeMatch = text.match(/\b(Beeldende Kunst|Film|Dans|Theater|Muziek|Performance|Architectuur|Literatuur|Debat|Workshop|Lezing|Festival)\b/);
                    if (typeMatch) {
                        eventType = typeMatch[1];
                    } else {
                        // Look for type indicators in specific patterns
                        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

                        // Look for type patterns in the first few lines
                        for (let i = 0; i < Math.min(3, lines.length); i++) {
                            const line = lines[i];
                            if (line.match(/\b(Beeldende Kunst|Film|Dans|Theater|Muziek|Performance|Architectuur|Literatuur|Debat|Workshop|Lezing|Festival)\b/)) {
                                const match = line.match(/\b(Beeldende Kunst|Film|Dans|Theater|Muziek|Performance|Architectuur|Literatuur|Debat|Workshop|Lezing|Festival)\b/);
                                if (match) {
                                    eventType = match[1];
                                    break;
                                }
                            }
                        }

                        // If still not found, try broader keyword matching
                        if (!eventType) {
                            if (text.includes('Beeldende Kunst')) eventType = 'Beeldende Kunst';
                            else if (text.includes('Film')) eventType = 'Film';
                            else if (text.includes('Dans')) eventType = 'Dans';
                            else if (text.includes('Theater')) eventType = 'Theater';
                            else if (text.includes('Muziek')) eventType = 'Muziek';
                            else if (text.includes('Performance')) eventType = 'Performance';
                            else if (text.includes('Architectuur')) eventType = 'Architectuur';
                            else if (text.includes('Literatuur')) eventType = 'Literatuur';
                            else if (text.includes('Debat')) eventType = 'Debat';
                            else if (text.includes('Workshop')) eventType = 'Workshop';
                            else if (text.includes('Lezing')) eventType = 'Lezing';
                            else if (text.includes('Festival')) eventType = 'Festival';
                            else {
                                eventType = 'Other';
                            }
                        }
                    }
                }
            }

            // Extract city from location
            const city = this.extractCity(location);

            // Check if this is a valid event (has title and some date/location info)
            if (!title || title === 'Untitled Event') {
                return null;
            }

            // If no date found, try to extract from text with better patterns
            if (!date || date === 'Date not specified') {
                const dateMatch = text.match(/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)[^.]*\d{1,2}\s+\w+\.?\s+\d{4}/) ||
                                text.match(/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)[^.]*\d{1,2}:\d{2}/) ||
                                text.match(/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)[^.]*\d{1,2}\s+\w+\.?/) ||
                                text.match(/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)[^.]*\d{1,2}\s+\w+/) ||
                                text.match(/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)[^.]*\d{1,2}/);
                date = dateMatch ? dateMatch[0].trim() : 'Date not specified';
            }

            const event = {
                id: Date.now() + Math.random(),
                title: title,
                date: date,
                location: location,
                city: city,
                type: eventType,
                artists: artists,
                festival: festival,
                isFeatured: title.includes('⭑'),
                dateAdded: new Date().toISOString().split('T')[0]
            };

            console.log('Structured parsing:', event.title, event.type, event.city);
            return event;
        } catch (error) {
            console.error('Error in structured parsing:', error);
            return null;
        }
    }

    parseEventElement(element) {
        try {
            // Skip elements that are too small to contain event data
            const text = element.textContent || '';
            if (text.length < 30) return null;

            // Look for event indicators in the text - be more permissive
            const hasEventContent = /(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen|Kunst|Film|Dans|Theater|Muziek|Performance|Amsterdam|Den Haag|Rotterdam|Utrecht)/i.test(text);

            if (!hasEventContent) return null;

            // Try to find structured data using DOM queries
            const titleElement = element.querySelector('h1, h2, h3, h4, [class*="title"], [class*="titel"], strong, b');
            const dateElement = element.querySelector('[class*="date"], time, [class*="datum"]');
            const locationElement = element.querySelector('[class*="location"], [class*="venue"], [class*="locatie"]');
            const typeElement = element.querySelector('[class*="type"], [class*="category"], [class*="categorie"]');
            const artistsElement = element.querySelector('[class*="artist"], [class*="performer"]');

            // Extract data with fallbacks
            let title = titleElement ? titleElement.textContent.trim() : '';
            let date = dateElement ? dateElement.textContent.trim() : '';
            let location = locationElement ? locationElement.textContent.trim() : '';
            let eventType = typeElement ? typeElement.textContent.trim() : '';
            let artists = artistsElement ? artistsElement.textContent.trim() : '';

            // If we couldn't find structured data, try to extract from text
            if (!title || !date || !location) {
                const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

                // Extract date from text
                if (!date) {
                    const dateMatch = text.match(/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)[^.]*\d{1,2}\s+\w+\.?\s+\d{4}/) ||
                                    text.match(/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)[^.]*\d{1,2}:\d{2}/) ||
                                    text.match(/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)[^.]*\d{1,2}\s+\w+\.?/) ||
                                    text.match(/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)[^.]*\d{1,2}\s+\w+/) ||
                                    text.match(/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)[^.]*\d{1,2}/);
                    date = dateMatch ? dateMatch[0].trim() : 'Date not specified';
                }

                // Extract event type from text - look more carefully
                if (!eventType) {
                    // Try multiple patterns for event types
                    const typeMatch = text.match(/\b(Beeldende Kunst|Film|Dans|Theater|Muziek|Performance|Architectuur|Literatuur|Debat|Workshop|Lezing|Festival)\b/);
                    if (typeMatch) {
                        eventType = typeMatch[1];
                    } else {
                        // Look for type indicators in specific patterns
                        for (let i = 0; i < Math.min(3, lines.length); i++) {
                            const line = lines[i];
                            if (line.match(/\b(Beeldende Kunst|Film|Dans|Theater|Muziek|Performance|Architectuur|Literatuur|Debat|Workshop|Lezing|Festival)\b/)) {
                                const match = line.match(/\b(Beeldende Kunst|Film|Dans|Theater|Muziek|Performance|Architectuur|Literatuur|Debat|Workshop|Lezing|Festival)\b/);
                                if (match) {
                                    eventType = match[1];
                                    break;
                                }
                            }
                        }

                        // If still not found, try broader keyword matching
                        if (!eventType) {
                            if (text.includes('Beeldende Kunst')) eventType = 'Beeldende Kunst';
                            else if (text.includes('Film')) eventType = 'Film';
                            else if (text.includes('Dans')) eventType = 'Dans';
                            else if (text.includes('Theater')) eventType = 'Theater';
                            else if (text.includes('Muziek')) eventType = 'Muziek';
                            else if (text.includes('Performance')) eventType = 'Performance';
                            else if (text.includes('Architectuur')) eventType = 'Architectuur';
                            else if (text.includes('Literatuur')) eventType = 'Literatuur';
                            else if (text.includes('Debat')) eventType = 'Debat';
                            else if (text.includes('Workshop')) eventType = 'Workshop';
                            else if (text.includes('Lezing')) eventType = 'Lezing';
                            else if (text.includes('Festival')) eventType = 'Festival';
                            else {
                                eventType = 'Other';
                            }
                        }
                    }
                }

                // Extract title from text (look for prominent text)
                if (!title) {
                    // Look for lines that are likely titles (not dates, locations, or types)
                    const titleCandidates = lines.filter(line =>
                        line.length > 5 &&
                        line.length < 100 &&
                        !line.includes(eventType) &&
                        !line.match(/(Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag|Vandaag|Morgen)/i) &&
                        !line.match(/(Amsterdam|Den Haag|Rotterdam|Utrecht|Eindhoven|Groningen|Maastricht|Arnhem|Den Bosch)/i) &&
                        !line.match(/^\s*\d/) && // Doesn't start with number
                        !line.match(/^\s*[A-Z][a-z]+\s+[A-Z][a-z]+/) // Not likely to be artist names
                    );

                    if (titleCandidates.length > 0) {
                        // Prefer longer lines as they're more likely to be titles
                        titleCandidates.sort((a, b) => b.length - a.length);
                        title = titleCandidates[0];
                    }
                }

                // Extract location from text
                if (!location) {
                    const locationMatch = text.match(/(Amsterdam|Den Haag|Rotterdam|Utrecht|Eindhoven|Groningen|Maastricht|Arnhem|Den Bosch|Haarlem|Leiden|Delft|Tilburg|Breda|Nijmegen|Enschede|Zwolle|Leeuwarden|Almere|Lelystad|Apeldoorn|Amersfoort|Waalwijk)[^,]*/i);
                    location = locationMatch ? locationMatch[0].trim() : 'Location not specified';
                }
            }

            // Extract city from location
            const city = this.extractCity(location);

            const event = {
                id: Date.now() + Math.random(),
                title: title || 'Untitled Event',
                date: date,
                location: location,
                city: city,
                type: eventType,
                artists: artists,
                festival: '',
                isFeatured: text.includes('⭑'),
                dateAdded: new Date().toISOString().split('T')[0]
            };

            console.log('Parsed event:', event.title, event.type, event.city);
            return event;
        } catch (error) {
            console.error('Error parsing event element:', error);
            return null;
        }
    }

    extractCity(fullLocation) {
        const cities = ['Amsterdam', 'Den Haag', 'Rotterdam', 'Utrecht', 'Eindhoven', 'Groningen', 'Maastricht', 'Arnhem', 'Den Bosch', 'Haarlem', 'Leiden', 'Delft', 'Tilburg', 'Breda', 'Nijmegen', 'Enschede', 'Zwolle', 'Leeuwarden', 'Almere', 'Lelystad', 'Apeldoorn', 'Amersfoort', 'Waalwijk'];

        // Handle the actual location format like "Museum Villa, Amsterdam"
        const locationText = fullLocation || '';
        if (!locationText || locationText === 'Location not specified') return 'Unknown';

        // First try to match known cities directly
        for (const city of cities) {
            if (locationText.includes(city)) {
                return city;
            }
        }

        // Try to extract city from common patterns (after last comma)
        const parts = locationText.split(',');
        if (parts.length > 1) {
            const potentialCity = parts[parts.length - 1].trim();
            // Check if it's one of our known cities
            if (cities.some(city => city === potentialCity)) {
                return potentialCity;
            }
        }

        // If no comma, try to extract city from known Dutch city names
        const cityMatch = fullLocation.match(/(Amsterdam|Den Haag|Rotterdam|Utrecht|Eindhoven|Groningen|Maastricht|Arnhem|Den Bosch|Haarlem|Leiden|Delft|Tilburg|Breda|Nijmegen|Enschede|Zwolle|Leeuwarden|Almere|Lelystad|Apeldoorn)/i);
        return cityMatch ? cityMatch[1] : fullLocation;
    }


    filterAndRender() {
        this.filterEvents();
        this.renderEvents();
    }

    filterEvents() {
        const typeFilter = document.getElementById('eventType').value;
        const locationFilter = document.getElementById('location').value;
        const dateFromFilter = document.getElementById('dateFrom').value;
        const dateToFilter = document.getElementById('dateTo').value;
        const sortBy = document.getElementById('sortBy').value;

        this.filteredEvents = this.events.filter(event => {
            // Type filter
            if (typeFilter && event.type !== typeFilter) return false;

            // Location filter (using city only)
            if (locationFilter && event.city !== locationFilter) return false;

            // Date filters (simplified - would need proper date parsing for production)
            if (dateFromFilter || dateToFilter) {
                const eventDate = this.parseEventDate(event.date);
                if (dateFromFilter && eventDate < new Date(dateFromFilter)) return false;
                if (dateToFilter && eventDate > new Date(dateToFilter)) return false;
            }

            return true;
        });

        this.sortEvents(sortBy);
    }

    parseEventDate(dateString) {
        // Simplified date parsing - would need more robust implementation
        if (dateString.includes('Vandaag')) return new Date();
        if (dateString.includes('Morgen')) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            return tomorrow;
        }
        
        // Try to parse Dutch date format
        const dateMatch = dateString.match(/(\d{1,2}\s+\w+\.?\s+\d{4})/);
        if (dateMatch) {
            const dutchMonths = {
                'jan': 0, 'feb': 1, 'mrt': 2, 'apr': 3, 'mei': 4, 'jun': 5,
                'jul': 6, 'aug': 7, 'sep': 8, 'okt': 9, 'nov': 10, 'dec': 11
            };
            
            const parts = dateMatch[1].split(' ');
            const day = parseInt(parts[0]);
            const month = dutchMonths[parts[1].replace('.', '')];
            const year = parseInt(parts[2]);
            
            return new Date(year, month, day);
        }
        
        return new Date(); // Fallback
    }

    sortEvents(sortBy) {
        this.filteredEvents.sort((a, b) => {
            switch (sortBy) {
                case 'date':
                    return this.parseEventDate(a.date) - this.parseEventDate(b.date);
                case 'date-desc':
                    return this.parseEventDate(b.date) - this.parseEventDate(a.date);
                case 'title':
                    return a.title.localeCompare(b.title);
                case 'location':
                    return a.city.localeCompare(b.city);
                case 'type':
                    return a.type.localeCompare(b.type);
                case 'date-added':
                    return new Date(a.dateAdded) - new Date(b.dateAdded);
                case 'date-added-desc':
                    return new Date(b.dateAdded) - new Date(a.dateAdded);
                default:
                    return 0;
            }
        });
    }

    renderEvents() {
        const eventsList = document.getElementById('eventsList');
        eventsList.innerHTML = '';

        if (this.filteredEvents.length === 0) {
            eventsList.innerHTML = '<div class="no-events">No events match your filters</div>';
        } else {
            this.filteredEvents.forEach(event => {
                const eventElement = this.createEventElement(event);
                eventsList.appendChild(eventElement);
            });
        }

        this.updateStats();
    }

    createEventElement(event) {
        const div = document.createElement('div');
        div.className = 'event-card';

        div.innerHTML = `
            <div class="event-header">
                <span class="event-type">${event.type}</span>
                <span class="event-date">${event.date}</span>
            </div>
            <h3 class="event-title">${event.title}${event.isFeatured ? '<span class="event-featured">⭑</span>' : ''}</h3>
            ${event.artists ? `<div class="event-artists">${event.artists}</div>` : ''}
            <div class="event-location">${event.location}</div>
            <div class="event-city">City: ${event.city}</div>
            ${event.festival ? `<span class="event-festival">${event.festival}</span>` : ''}
        `;

        return div;
    }

    updateFilters() {
        const typeSelect = document.getElementById('eventType');
        const locationSelect = document.getElementById('location');

        // Clear existing options (except "All")
        typeSelect.innerHTML = '<option value="">All Types</option>';
        locationSelect.innerHTML = '<option value="">All Locations</option>';

        // Get unique types and cities, filter out empty/unknown values
        const types = [...new Set(this.events.map(event => event.type))]
            .filter(type => type && type !== 'Other' && type !== 'Untitled Event')
            .sort();

        const cities = [...new Set(this.events.map(event => event.city))]
            .filter(city => city && city !== 'Unknown' && city !== 'Location not specified')
            .sort();

        // Populate type filter
        types.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            typeSelect.appendChild(option);
        });

        // Populate location filter with cities only
        cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city;
            option.textContent = city;
            locationSelect.appendChild(option);
        });
    }

    updateStats() {
        const eventCount = document.getElementById('eventCount');
        eventCount.textContent = `${this.filteredEvents.length} events found`;
    }

    resetFilters() {
        document.getElementById('eventType').value = '';
        document.getElementById('location').value = '';
        document.getElementById('dateFrom').value = '';
        document.getElementById('dateTo').value = '';
        document.getElementById('sortBy').value = 'date';
        
        this.filterAndRender();
    }


    showLoading(show) {
        const loadingElement = document.getElementById('loading');

        if (show) {
            loadingElement.classList.remove('hidden');
        } else {
            loadingElement.classList.add('hidden');
        }
    }

    showError(message) {
        const eventsList = document.getElementById('eventsList');
        eventsList.innerHTML = `<div class="no-events">${message}</div>`;
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new WeArePublicScraper();
});
