import 'mocha'
import * as assert from 'assert'

import Rakam from './../src/rakam'

describe('Rakam', function() {

    before(() => {
        if (!process.env['RAKAM_TEST_KEY'] || !process.env['RAKAM_TEST_ENDPOINT']) {
            throw new Error('Missing RAKAM_TEST_KEY, RAKAM_TEST_ENDPOINT env vars.')
        }
    })

    const client = new Rakam(
        process.env['RAKAM_TEST_ENDPOINT'] as string,
        process.env['RAKAM_TEST_KEY'] as string
    )

    it('should collect event', async function() {
        const rv = await client.collect('test', {
            date: new Date().toISOString(),
            testing: true,
            steem: 'on',
        })
        assert.equal(rv, 1)
    })

})
