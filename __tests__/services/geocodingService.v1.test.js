const axios = require('axios');
const GeocodingService = require('../../services/geocodingService');

jest.mock('axios');

describe('GeocodingService (v1)', () => {
    let geo;

    beforeEach(() => {
        geo = new GeocodingService();
        jest.clearAllMocks();
    });

    it('geocodeAddress uses Nominatim when axios returns results', async () => {
        axios.get.mockResolvedValue({
            data: [{ lat: '19.076', lon: '72.8777', display_name: 'Mumbai' }],
        });

        const out = await geo.geocodeAddress('Mumbai, Maharashtra, India');

        expect(out.lat).toBeCloseTo(19.076);
        expect(out.source).toBe('nominatim');
    });

    it('geocodeAddress decodes full Plus Code without network when valid', async () => {
        axios.get.mockResolvedValue({ data: [] });

        const plus =
            '7JVW52GR+8C';
        const out = await geo.geocodeAddress(`${plus} Test Area`);

        expect(out).toHaveProperty('lat');
        expect(out).toHaveProperty('lon');
        expect(out.source).toBe('plus_code');
    });

    it('geocodeAddressWithFallback uses city fallback when primary fails', async () => {
        axios.get.mockResolvedValue({ data: [] });
        jest.spyOn(GeocodingService.prototype, 'geocodeAddress').mockRejectedValue(new Error('fail'));

        const g = new GeocodingService();
        const out = await g.geocodeAddressWithFallback('office in ahmedabad');

        expect(out.source).toBe('approximate');
        expect(out.lat).toBeDefined();
        GeocodingService.prototype.geocodeAddress.mockRestore();
    });

    it('handleError throws AppError', () => {
        expect(() => geo.handleError('x', 400, 'E')).toThrow();
    });

    it('geocodeAddress throws when Nominatim returns no results for all variations', async () => {
        axios.get.mockResolvedValue({ data: [] });

        await expect(
            geo.geocodeAddress('ZZ9-Obscure-Place-No-Matches-12345')
        ).rejects.toMatchObject({ errorCode: 'GEOCODING_NOT_FOUND' });
    }, 20000);
});
