const axios = require('axios');
const GeocodingService = require('../../services/geocodingService2');
const AppError = require('../../utils/appError');
require('dotenv').config();

// Mock only the OLC library, not axios (to allow real API calls)
jest.mock('open-location-code');

// Suppress console logs during tests
beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => { });
});

afterAll(() => {
    jest.restoreAllMocks();
});

describe('GeocodingService', () => {
    let service;
    let mockOlc;

    beforeEach(() => {
        jest.clearAllMocks();

        const { OpenLocationCode } = require('open-location-code');
        mockOlc = {
            isValid: jest.fn(),
            isFull: jest.fn(),
            isShort: jest.fn(),
            decode: jest.fn(),
            recoverNearest: jest.fn()
        };
        OpenLocationCode.mockImplementation(() => mockOlc);

        service = new GeocodingService();
    });

    describe('Constructor', () => {
        it('should initialize with city fallbacks', () => {
            expect(service.cityFallbacks).toBeDefined();
            expect(service.cityFallbacks.ahmedabad).toEqual({ lat: 23.0225, lon: 72.5714 });
            expect(service.cityFallbacks.mumbai).toEqual({ lat: 19.0760, lon: 72.8777 });
        });

        it('should initialize with providers configuration', () => {
            expect(service.providers).toHaveLength(2);
            expect(service.providers[0].name).toBe('openrouteservice');
            expect(service.providers[1].name).toBe('geoapify');
        });

        it('should setup axios keep-alive agent', () => {
            expect(axios.defaults.httpsAgent).toBeDefined();
        });
    });

    describe('handleError', () => {
        it('should throw AppError with correct parameters', () => {
            expect(() => {
                service.handleError('Test error', 404, 'TEST_ERROR', { test: 'data' });
            }).toThrow(AppError);
        });

        it('should use default parameters when not provided', () => {
            expect(() => {
                service.handleError('Test error');
            }).toThrow(AppError);
        });
    });

    describe('geocodeAddress - Plus Code Handling', () => {
        it('should handle valid full plus code', async () => {
            const address = '7JMX2R2C+2C';
            mockOlc.isValid.mockReturnValue(true);
            mockOlc.isFull.mockReturnValue(true);
            mockOlc.decode.mockReturnValue({
                latitudeCenter: 23.05,
                longitudeCenter: 72.57
            });

            const result = await service.geocodeAddress(address);

            expect(result).toEqual({
                lat: 23.05,
                lon: 72.57,
                source: 'plus_code'
            });
            expect(mockOlc.isValid).toHaveBeenCalledWith(address.toUpperCase());
            expect(mockOlc.decode).toHaveBeenCalled();
        });

        it('should handle short plus code with locality', async () => {
            const address = '2R2C+2C, Ahmedabad';
            mockOlc.isValid.mockReturnValue(true);
            mockOlc.isFull.mockReturnValue(false);
            mockOlc.isShort.mockReturnValue(true);
            mockOlc.recoverNearest.mockReturnValue('7JMX2R2C+2C');
            mockOlc.decode.mockReturnValue({
                latitudeCenter: 23.05,
                longitudeCenter: 72.57
            });

            const result = await service.geocodeAddress(address);

            expect(result).toEqual({
                lat: 23.05,
                lon: 72.57,
                source: 'plus_code',
                // providerSource can be 'approximate' if API calls fail, which is expected
                providerSource: expect.any(String)
            });
        });

        it('should skip invalid plus codes and try regular geocoding', async () => {
            const address = 'INVALID+CODE';
            mockOlc.isValid.mockReturnValue(false);

            const result = await service.geocodeAddress(address);

            // Should fall through to regular geocoding which will likely fail and throw
            // OR succeed if the address somehow resolves, but expect some result structure
            expect(result).toHaveProperty('lat');
            expect(result).toHaveProperty('lon');
            expect(result).toHaveProperty('source');
        }, 10000); // Increased timeout for real API calls
    });

    describe('geocodeAddress - Provider-based Geocoding', () => {
        it('should successfully geocode known addresses', async () => {
            const address = 'Ahmedabad, Gujarat, India';

            const result = await service.geocodeAddress(address);

            expect(result).toHaveProperty('lat');
            expect(result).toHaveProperty('lon');
            expect(result).toHaveProperty('source');
            // Source will be either a provider name or 'approximate' depending on API availability
            expect(['openrouteservice', 'geoapify', 'approximate']).toContain(result.source);

            // For Ahmedabad, coordinates should be approximately correct
            expect(result.lat).toBeCloseTo(23.0225, 1);
            expect(result.lon).toBeCloseTo(72.5714, 1);
        }, 15000);

        it('should handle provider failures and use city fallback', async () => {
            const address = 'Mumbai, India';

            const result = await service.geocodeAddress(address);

            expect(result).toHaveProperty('lat');
            expect(result).toHaveProperty('lon');
            expect(result).toHaveProperty('source');

            // Should either succeed with provider or fallback to approximate
            expect(['openrouteservice', 'geoapify', 'approximate']).toContain(result.source);

            // For Mumbai, coordinates should be approximately correct
            expect(result.lat).toBeCloseTo(19.0760, 1);
            expect(result.lon).toBeCloseTo(72.8777, 1);
        }, 15000);

        it('should return results with proper structure', async () => {
            const address = 'Delhi, India';

            const result = await service.geocodeAddress(address);

            expect(result).toHaveProperty('lat');
            expect(result).toHaveProperty('lon');
            expect(result).toHaveProperty('source');
            expect(typeof result.lat).toBe('number');
            expect(typeof result.lon).toBe('number');
            expect(typeof result.source).toBe('string');
        }, 15000);
    });

    describe('Address Variations and Fallbacks', () => {
        it('should try address variations when initial geocoding fails', async () => {
            const address = 'Near Market, opp. to Mall, Street 5, Ahmedabad, Gujarat, India';

            const result = await service.geocodeAddress(address);

            expect(result).toBeDefined();
            expect(result).toHaveProperty('lat');
            expect(result).toHaveProperty('lon');
            // Should eventually resolve to something, even if approximate
            expect(result.lat).toBeCloseTo(23.0225, 1); // Ahmedabad area
        }, 20000);

        it('should use city fallback when all geocoding attempts fail', async () => {
            const address = 'sjsjjsjsjs,Ahmedabad';

            const result = await service.geocodeAddress(address);

            expect(result).toHaveProperty('lat');
            expect(result).toHaveProperty('lon');
            expect(['openrouteservice', 'geoapify', 'approximate']).toContain(result.source);
        }, 15000);

        it('should throw error when address not found and no city fallback', async () => {
            const address = 'zdicincin';

            await expect(service.geocodeAddress(address))
                .rejects
                .toThrow(AppError);
        }, 15000);
    });

    describe('_cleanAddress', () => {
        it('should remove plus codes from address', () => {
            const address = '7JMX2R2C+2C, Street Name, City';
            const cleaned = service._cleanAddress(address);
            expect(cleaned).not.toContain('7JMX2R2C+2C');
        });

        it('should remove "opp. to" phrases', () => {
            const address = 'opp. to Mall, Street Name';
            const cleaned = service._cleanAddress(address);
            expect(cleaned).not.toContain('opp. to');
        });

        it('should remove "near" phrases', () => {
            const address = 'near Railway Station, City';
            const cleaned = service._cleanAddress(address);
            expect(cleaned).not.toContain('near');
        });

        it('should remove "opposite" phrases', () => {
            const address = 'opposite Park, Street';
            const cleaned = service._cleanAddress(address);
            expect(cleaned).not.toContain('opposite');
        });

        it('should handle multiple cleanup operations', () => {
            const address = '7JMX2R2C+2C opp. to Mall, near Station, City';
            const cleaned = service._cleanAddress(address);
            expect(cleaned).not.toContain('7JMX2R2C+2C');
            expect(cleaned).not.toContain('opp. to');
            expect(cleaned).not.toContain('near');
        });
    });

    describe('_getAddressVariations', () => {
        it('should generate Indian address variations', () => {
            const address = 'Street, Area, Ahmedabad, Gujarat, India';
            const variations = service._getAddressVariations(address, true);

            expect(variations).toContain(address);
            expect(variations).toContain('Ahmedabad, Gujarat, India');
            expect(variations).toContain('Gujarat, India');
            expect(variations).toContain('India');
        });

        it('should not duplicate India suffix', () => {
            const address = 'Ahmedabad, India';
            const variations = service._getAddressVariations(address, true);

            const indiaCount = variations.filter(v => v === 'Ahmedabad, India' || v === 'Ahmedabad, India, India').length;
            expect(indiaCount).toBe(1);
        });

        it('should generate non-Indian address variations', () => {
            const address = 'Street, City, State, USA';
            const variations = service._getAddressVariations(address, false);

            expect(variations).toContain(address);
            expect(variations.length).toBeGreaterThan(1);
        });

        it('should filter out empty variations', () => {
            const address = 'City';
            const variations = service._getAddressVariations(address, true);

            expect(variations.every(v => v.length > 0)).toBe(true);
        });

        it('should remove duplicate variations', () => {
            const address = 'City';
            const variations = service._getAddressVariations(address, true);

            const uniqueVariations = [...new Set(variations)];
            expect(variations.length).toBe(uniqueVariations.length);
        });
    });

    describe('geocodeAddressWithFallback', () => {
        it('should return result from geocoding attempt', async () => {
            const result = await service.geocodeAddressWithFallback('Ahmedabad, India');

            expect(result).toHaveProperty('lat');
            expect(result).toHaveProperty('lon');
            expect(result).toHaveProperty('source');

            // Should be close to Ahmedabad coordinates
            expect(result.lat).toBeCloseTo(23.0225, 1);
            expect(result.lon).toBeCloseTo(72.5714, 1);
        }, 15000);

        it('should use city fallback when geocoding fails', async () => {
            const result = await service.geocodeAddressWithFallback('Unknown Street, Mumbai');

            expect(result).toHaveProperty('lat');
            expect(result).toHaveProperty('lon');
            expect(['openrouteservice', 'geoapify', 'approximate']).toContain(result.source);
        }, 15000);

        it('should throw AppError when no fallback available', async () => {
            await expect(service.geocodeAddressWithFallback('zzzxxyyqqwwee998877'))
                .rejects
                .toThrow(AppError);
        }, 15000);
    });

    describe('Error Handling', () => {
        it('should handle unknown addresses gracefully', async () => {
            await expect(service.geocodeAddress('xbxxbbbb'))
                .rejects
                .toThrow(AppError);
        }, 15000);

        it('should handle empty address string', async () => {
            await expect(service.geocodeAddress(''))
                .rejects
                .toThrow(AppError);
        }, 10000);

        it('should handle address with only special characters', async () => {
            await expect(service.geocodeAddress('!@#$%^&*()'))
                .rejects
                .toThrow(AppError);
        }, 10000);
    });

    describe('Edge Cases', () => {
        it('should handle very long addresses', async () => {
            const longAddress = 'A'.repeat(500);

            // Very long addresses should typically fail
            await expect(service.geocodeAddress(longAddress))
                .rejects
                .toThrow(AppError);
        }, 15000);

        it('should handle addresses with unicode characters', async () => {
            const address = '中文地址, નગર, City';

            // Unicode addresses will likely fail without proper city fallback
            await expect(service.geocodeAddress(address))
                .rejects
                .toThrow(AppError);
        }, 15000);

        it('should handle case-insensitive city fallback matching', async () => {
            const result = await service.geocodeAddress('AHMEDABAD');

            expect(result).toHaveProperty('lat');
            expect(result).toHaveProperty('lon');
            expect(['openrouteservice', 'geoapify', 'approximate']).toContain(result.source);
        }, 10000);
    });

    describe('Provider Configuration', () => {
        it('should correctly build openrouteservice params', () => {
            const provider = service.providers[0];
            const params = provider.buildParams('Test Address');

            expect(params).toMatchObject({
                api_key: process.env.ORS_KEY,
                text: 'Test Address',
                size: 1
            });
            expect(params.boundary).toBeDefined();
        });

        it('should correctly build geoapify params', () => {
            const provider = service.providers[1];
            const params = provider.buildParams('Test Address');

            expect(params).toMatchObject({
                apiKey: process.env.GEOAPIFY_KEY,
                text: 'Test Address',
                limit: 1,
                lang: 'en'
            });
        });

        it('should correctly extract coordinates from openrouteservice response', () => {
            const provider = service.providers[0];
            const mockData = {
                features: [{
                    geometry: { coordinates: [72.5714, 23.0225] }
                }]
            };

            const result = provider.extract(mockData);

            expect(result).toEqual({
                lat: 23.0225,
                lon: 72.5714
            });
        });

        it('should correctly extract coordinates from geoapify response', () => {
            const provider = service.providers[1];
            const mockData = {
                features: [{
                    properties: { lat: 19.0760, lon: 72.8777 }
                }]
            };

            const result = provider.extract(mockData);

            expect(result).toEqual({
                lat: 19.0760,
                lon: 72.8777
            });
        });
    });
});