import {describe, expect, it} from 'vitest'

import {normalizeEssayApiBaseUrl} from './essay-api-config'

describe('Essay API configuration', () => {
    it('normalizes configured URLs and preserves the production default', () => {
        expect(
            normalizeEssayApiBaseUrl('  https://example.com/api///  ')
        ).toBe('https://example.com/api')
        expect(normalizeEssayApiBaseUrl()).toBe('https://api.essay.ink')
    })
})
