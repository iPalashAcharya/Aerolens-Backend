const axios = require('axios');
const OpenLocationCode = require('open-location-code').OpenLocationCode;
const AppError = require('../utils/appError'); // Import your AppError

class GeocodingService {
    constructor() {
        this.olc = new OpenLocationCode();
        this.cityFallbacks = {
            'ahmedabad': { lat: 23.0225, lon: 72.5714 },
            'mumbai': { lat: 19.0760, lon: 72.8777 },
            'delhi': { lat: 28.6139, lon: 77.2090 },
            'bangalore': { lat: 12.9716, lon: 77.5946 },
            'chennai': { lat: 13.0827, lon: 80.2707 },
            'kolkata': { lat: 22.5726, lon: 88.3639 },
            'hyderabad': { lat: 17.3850, lon: 78.4867 },
            'pune': { lat: 18.5204, lon: 73.8567 }
        };
    }

    handleError(message, statusCode = 500, errorCode = 'GEOCODING_ERROR', details = {}) {
        throw new AppError(message, statusCode, errorCode, details);
    }

    async geocodeAddress(address) {
        console.log('Starting geocoding for:', address);
        // Step 1: Check for Plus Code first
        const plusCodeRegex = /[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}/;
        const plusCodeMatch = address.match(plusCodeRegex);
        if (plusCodeMatch) {
            const result = await this._handlePlusCode(plusCodeMatch[0], address);
            if (result) return result;
        }
        // Step 2: Fall back to Nominatim geocoding
        return await this._geocodeWithNominatim(address);
    }

    async _handlePlusCode(plusCode, originalAddress) {
        const upperPlusCode = plusCode.toUpperCase();
        console.log('Found Plus Code:', upperPlusCode);
        try {
            if (!this.olc.isValid(upperPlusCode)) {
                console.log('Not a valid Open Location Code; falling back to normal geocode');
                return null;
            }
            if (this.olc.isFull(upperPlusCode)) {
                console.log('Full OLC detected, decoding...');
                const area = this.olc.decode(upperPlusCode);
                return {
                    lat: area.latitudeCenter,
                    lon: area.longitudeCenter,
                    source: 'plus_code'
                };
            }
            if (this.olc.isShort(upperPlusCode)) {
                return await this._handleShortPlusCode(upperPlusCode, originalAddress);
            }
        } catch (error) {
            console.log('Plus Code decode failed:', error.message);
            console.log('Falling back to regular geocoding');
        }
        return null;
    }

    async _handleShortPlusCode(plusCode, originalAddress) {
        console.log('Short OLC detected. Attempting to recover full code using locality from address...');
        const plusCodeRegex = /[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}/;
        const localityText = originalAddress.replace(plusCodeRegex, '').trim()
            .replace(/^[,;\-]+|[,;\-]+$/g, '').trim();
        let ref = null;
        if (localityText) {
            console.log('Geocoding locality to get reference coords:', localityText);
            try {
                ref = await this._geocodeWithNominatim(localityText);
            } catch (e) {
                console.log('Locality geocode failed:', e.message);
                return null;
            }
        }
        if (!ref) {
            console.log('No usable reference location for short code; falling back to regular geocoding of whole address');
            return null;
        }
        const fullCode = this.olc.recoverNearest(plusCode, ref.lat, ref.lon);
        console.log('Recovered full code:', fullCode);
        const area = this.olc.decode(fullCode);
        return {
            lat: area.latitudeCenter,
            lon: area.longitudeCenter,
            source: 'plus_code'
        };
    }

    async _geocodeWithNominatim(address) {
        const url = 'https://nominatim.openstreetmap.org/search';
        let cleanAddress = this._cleanAddress(address);

        const isIndianAddress = /india|gujarat|maharashtra|delhi|mumbai|bangalore|chennai|kolkata|hyderabad|pune|ahmedabad/i.test(address);
        const addressVariations = this._getAddressVariations(cleanAddress, isIndianAddress);
        // Try first 3 variations in parallel for speed
        const result = await this._tryParallelGeocoding(addressVariations.slice(0, 3), url, isIndianAddress);
        if (result) return result;
        // If all parallel attempts failed, try remaining variations sequentially
        console.log('All parallel attempts failed, trying sequential fallback');
        return await this._trySequentialGeocoding(addressVariations.slice(3), url, isIndianAddress, address);
    }

    _cleanAddress(address) {
        let cleanAddress = address;
        // Remove Plus Code if present
        cleanAddress = cleanAddress.replace(/[A-Z0-9]{4}\+[A-Z0-9]{2,3}[,\s]*/, '').trim();
        // Remove directional references and landmarks 
        cleanAddress = cleanAddress.replace(/opp\.\s*to[^,]*,?\s*/gi, '');
        cleanAddress = cleanAddress.replace(/near[^,]*,?\s*/gi, '');
        cleanAddress = cleanAddress.replace(/opposite[^,]*,?\s*/gi, '');
        return cleanAddress;
    }

    _getAddressVariations(cleanAddress, isIndianAddress) {
        let addressVariations = [];
        if (isIndianAddress) {
            const parts = cleanAddress.split(',').map(part => part.trim()).filter(part => part);
            addressVariations = [
                cleanAddress,
                parts.slice(-3).join(', '), // Last 3 parts
                parts.slice(-2).join(', '), // Last 2 parts
                parts.slice(-1).join(', '), // Just the last part
                cleanAddress + ', India', // Add India if not present
            ];
        } else {
            addressVariations = [
                cleanAddress,
                cleanAddress.replace(/,\s*USA$/, ''),
                cleanAddress.replace(/,.*$/, ''),
                cleanAddress.split(',').slice(0, 2).join(',')
            ];
        }
        return [...new Set(addressVariations)].filter((addr) => addr && addr.length > 0);
    }

    async _tryParallelGeocoding(variations, url, isIndianAddress) {
        const geocodingPromises = variations.map(async (addr, index) => {
            try {
                if (index > 0) {
                    await new Promise(resolve => setTimeout(resolve, index * 200));
                }
                console.log(`Trying address variation: "${addr}"`);
                const response = await axios.get(url, {
                    params: {
                        q: addr,
                        format: 'json',
                        addressdetails: 1,
                        limit: 1,
                        countrycodes: isIndianAddress ? 'in' : undefined
                    },
                    headers: {
                        'User-Agent': 'Aerolens/1.0'
                    },
                    timeout: 8000
                });
                if (response.data && response.data.length > 0) {
                    const place = response.data[0];
                    console.log(`Found location for: "${addr}"`);
                    return {
                        lat: parseFloat(place.lat),
                        lon: parseFloat(place.lon),
                        source: 'nominatim',
                        matched_address: place.display_name,
                        variation_used: addr
                    };
                }
                this.handleError(`No results for: ${addr}`, 404, 'GEOCODING_NOT_FOUND', { address: addr }); // Use AppError
            } catch (error) {
                console.log(`Failed variation "${addr}":`, error.message);
                throw error; // Let the Promise.allSettled handle this
            }
        });
        const results = await Promise.allSettled(geocodingPromises);
        for (const result of results) {
            if (result.status === 'fulfilled') {
                return result.value;
            }
        }
        return null;
    }

    async _trySequentialGeocoding(variations, url, isIndianAddress, originalAddress) {
        for (const addr of variations) {
            if (!addr || addr.trim().length === 0) continue;
            try {
                console.log(`Sequential fallback for: "${addr}"`);
                const response = await axios.get(url, {
                    params: {
                        q: addr,
                        format: 'json',
                        addressdetails: 1,
                        limit: 1,
                        countrycodes: isIndianAddress ? 'in' : undefined
                    },
                    headers: {
                        'User-Agent': 'Aerolens/1.0'
                    },
                    timeout: 5000
                });
                if (response.data && response.data.length > 0) {
                    const place = response.data[0];
                    return {
                        lat: parseFloat(place.lat),
                        lon: parseFloat(place.lon),
                        source: 'nominatim',
                        matched_address: place.display_name
                    };
                }
            } catch (error) {
                console.log(`Failed variation "${addr}":`, error.message);
                if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }
        // Use AppError here as well
        this.handleError('No results found for address: ' + originalAddress, 404, 'GEOCODING_NOT_FOUND', { address: originalAddress });
    }

    async geocodeAddressWithFallback(address) {
        try {
            return await this.geocodeAddress(address);
        } catch (error) {
            console.log('Primary geocoding failed:', error.message);

            for (const [city, coords] of Object.entries(this.cityFallbacks)) {
                if (address.toLowerCase().includes(city)) {
                    console.log(`Using approximate coordinates for ${city}`);
                    return {
                        ...coords,
                        source: 'approximate'
                    };
                }
            }
            // Throw original or wrapped error using AppError
            this.handleError(error.message || 'Geocoding failed', 500, 'GEOCODING_FAILURE', { originalError: error });
        }
    }
}

module.exports = GeocodingService;