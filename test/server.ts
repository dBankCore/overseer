import 'mocha'
import * as assert from 'assert'
import * as http from 'http'
import {utils} from '@steemit/jsonrpc'

import {app} from './../src/server'

describe('server', function() {
    const port = process.env['TEST_HTTP_PORT'] ? parseInt(process.env['TEST_HTTP_PORT'] as string) : 63205
    const server = http.createServer(app.callback())

    before((done) => { server.listen(port, 'localhost', done) })
    after((done) => { server.close(done) })

    it('should healthcheck', async function() {
        const rv = await utils.jsonRequest(
            {port, protocol: 'http:', method: 'get', path: '/.well-known/healthcheck.json'},
            {}
        )
        assert.deepEqual(rv, {ok: true})
    })

})
