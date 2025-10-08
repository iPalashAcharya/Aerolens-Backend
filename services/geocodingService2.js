const axios = require('axios');
const { OpenLocationCode } = require('open-location-code');
const AppError = require('../utils/appError');

class GeocodingService {
    constructor() {
        this.olc = new OpenLocationCode();
        this.cityFallbacks = {
            ahmedabad: { lat: 23.0225, lon: 72.5714 },
            mumbai: { lat: 19.0760, lon: 72.8777 },
            delhi: { lat: 28.6139, lon: 77.2090 },
            bangalore: { lat: 12.9716, lon: 77.5946 },
            chennai: { lat: 13.0827, lon: 80.2707 },
            kolkata: { lat: 22.5726, lon: 88.3639 },
            hyderabad: { lat: 17.3850, lon: 78.4867 },
            pune: { lat: 18.5204, lon: 73.8567 }
        };

        // Keep-alive agent for performance
        const https = require('https');
        const agent = new https.Agent({ keepAlive: true, maxSockets: 10 });
        axios.defaults.httpsAgent = agent;

        // Provider configs
        this.providers = [
            {
                name: 'openrouteservice',
                url: 'https://api.openrouteservice.org/geocode/search',
                buildParams: q => ({
                    api_key: process.env.ORS_KEY,
                    text: q,
                    boundary: JSON.stringify({ country: ['IN'] }),
                    size: 1
                }),
                extract: data => ({
                    lat: data.features[0].geometry.coordinates[1],
                    lon: data.features[0].geometry.coordinates[0]
                })
            },
            {
                name: 'geoapify',
                url: 'https://api.geoapify.com/v1/geocode/search',
                buildParams: q => ({
                    apiKey: process.env.GEOAPIFY_KEY,
                    text: q,
                    limit: 1,
                    lang: 'en'
                }),
                extract: data => ({
                    lat: data.features[0].properties.lat,
                    lon: data.features[0].properties.lon
                })
            }
        ];
    }

    handleError(message, statusCode = 500, errorCode = 'GEOCODING_ERROR', details = {}) {
        throw new AppError(message, statusCode, errorCode, details);
    }

    async geocodeAddress(address) {
        console.log('Starting geocoding for:', address);
        // Step 1: Plus Code handling
        const plusCodeRegex = /[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}/i;
        const plusMatch = address.match(plusCodeRegex);
        if (plusMatch) {
            const plusResult = await this._handlePlusCode(plusMatch[0], address);
            if (plusResult) return plusResult;
        }
        // Step 2: Provider-based geocoding
        return await this._geocodeWithProviders(address);
    }

    async _handlePlusCode(code, original) {
        const upper = code.toUpperCase();
        try {
            if (!this.olc.isValid(upper)) return null;
            if (this.olc.isFull(upper)) {
                const area = this.olc.decode(upper);
                return { lat: area.latitudeCenter, lon: area.longitudeCenter, source: 'plus_code' };
            }
            if (this.olc.isShort(upper)) {
                return await this._handleShortPlusCode(upper, original);
            }
        } catch (err) {
            console.log('Plus code decode error:', err);
        }
        return null;
    }

    async _handleShortPlusCode(code, original) {
        console.log('Short plus code detected');
        const plusCodeRegex = /[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}/i;
        const locality = original.replace(plusCodeRegex, '').trim()
            .replace(/^[,;\-]+|[,;\-]+$/g, '').trim();
        let ref = null;
        if (locality) {
            try {
                ref = await this._geocodeWithProviders(locality);
            } catch {
                return null;
            }
        }
        if (!ref) return null;
        const full = this.olc.recoverNearest(code, ref.lat, ref.lon);
        const area = this.olc.decode(full);
        return { lat: area.latitudeCenter, lon: area.longitudeCenter, source: 'plus_code', providerSource: ref.source };
    }

    async _geocodeWithProviders(address, skipVariations = false) {
        const tasks = this.providers.map(provider => (async () => {
            if (!process.env[provider.name.toUpperCase() + '_KEY']) {
                throw new Error(`${provider.name} API key not set`);
            }
            const params = provider.buildParams(address);
            const resp = await axios.get(provider.url, {
                params,
                headers: { 'User-Agent': 'Aerolens/1.0' },
                timeout: 3000
            });
            const data = resp.data;
            if (!data || data.features?.length === 0) {
                throw new Error(`${provider.name} returned no results`);
            }
            const { lat, lon } = provider.extract(data);
            return { lat, lon, source: provider.name };
        })());

        try {
            return await Promise.any(tasks);
        } catch (error) {
            // CRITICAL FIX: Only try variations if not already doing so
            if (skipVariations) {
                throw error;
            }
            console.log('All provider requests failed, trying variations...');
            return await this._tryVariations(address);
        }
    }

    async _tryVariations(address) {
        const clean = this._cleanAddress(address);
        const isIN = /india|gujarat|maharashtra|delhi|mumbai|bangalore|chennai|kolkata|hyderabad|pune|ahmedabad/i.test(address);
        const variations = this._getAddressVariations(clean, isIN);

        // CRITICAL FIX: Skip variations when calling _geocodeWithProviders
        // to prevent infinite recursion
        for (const variation of variations.slice(0, 3)) {
            try {
                // Pass skipVariations=true to prevent recursive variation attempts
                const result = await this._geocodeWithProviders(variation, true);
                if (result) return result;
            } catch (err) {
                // Continue to next variation
                continue;
            }
        }

        // City fallback
        const cityEntry = Object.entries(this.cityFallbacks)
            .find(([city]) => address.toLowerCase().includes(city));
        if (cityEntry) {
            const [, coords] = cityEntry;
            return { ...coords, source: 'approximate' };
        }

        this.handleError(`No results found for "${address}"`, 404, 'GEOCODING_NOT_FOUND', { address });
    }

    _cleanAddress(address) {
        let a = address.replace(/[A-Z0-9]{4}\+[A-Z0-9]{2,3}[,\s]*/, '').trim();
        a = a.replace(/opp\.\s*to[^,]*,?\s*/gi, '')
            .replace(/near[^,]*,?\s*/gi, '')
            .replace(/opposite[^,]*,?\s*/gi, '')
            .trim();
        return a;
    }

    _getAddressVariations(clean, isIndian) {
        const parts = clean.split(',').map(p => p.trim()).filter(p => p);

        if (isIndian) {
            const variations = [
                clean,
                parts.slice(-3).join(', '),
                parts.slice(-2).join(', '),
                parts.slice(-1).join(', ')
            ];

            // Only add ", India" suffix if not already present
            if (!clean.toLowerCase().includes('india')) {
                variations.push(`${clean}, India`);
            }

            return [...new Set(variations)].filter(Boolean);
        }

        return [
            clean,
            clean.replace(/,\s*USA$/, ''),
            clean.replace(/,.*$/, ''),
            parts.slice(0, 2).join(', ')
        ].filter((v, i, arr) => v && arr.indexOf(v) === i); // Remove duplicates
    }

    async geocodeAddressWithFallback(address) {
        try {
            return await this.geocodeAddress(address);
        } catch (err) {
            console.log('Primary geocoding failed:', err.message);
            const cityEntry = Object.entries(this.cityFallbacks)
                .find(([city]) => address.toLowerCase().includes(city));
            if (cityEntry) {
                const [, coords] = cityEntry;
                return { ...coords, source: 'approximate' };
            }
            this.handleError(err.message, err.statusCode || 500, err.errorCode || 'GEOCODING_FAILURE', { originalError: err });
        }
    }
}

module.exports = GeocodingService;