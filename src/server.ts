/**
 * @file Overseer server.
 * @author Johan Nordberg <johan@steemit.com>
 */

import * as bunyan from 'bunyan'
import * as cluster from 'cluster'
import * as config from 'config'
import * as Router from 'koa-router'
import * as Koa from 'koa'
import * as os from 'os'
import * as UUID from 'uuid/v4'
import {JsonRpc, requestLogger, rpcLogger} from '@steemit/jsonrpc'

import Rakam from './rakam'

const rakam = new Rakam(
    config.get('rakam.api_endpoint'),
    config.get('rakam.api_key')
)

const logger = bunyan.createLogger({
    name: config.get('name'),
    streams: (config.get('log') as any[]).map(({level, out}) => {
        if (out === 'stdout') {
            return {level, stream: process.stdout}
        } else if (out === 'stderr') {
            return {level, stream: process.stderr}
        } else {
            return {level, path: out}
        }
    })
})

export const app = new Koa()

const router = new Router()
const rpc = new JsonRpc(config.get('name'))

app.proxy = !!config.get('proxy')
app.on('error', (error) => {
    logger.error(error, 'Application error')
})

app.use(requestLogger(logger))
app.use(rpcLogger(logger, 'info'))

router.post('/', rpc.middleware)

router.get('/.well-known/healthcheck.json', async (ctx, next) => {
    ctx.body = {ok: true}
})

app.use(router.routes())

rpc.register('pageview', async function(account: string, page: string, referer: string) {
    this.log.info({account, page, referer}, 'recording pageview')
    return rakam.collect('pageview', {account, page, referer})
})

rpc.register('collect', async function(collection: string, metadata: any) {
    this.log.info({collection, metadata}, 'collecting data')
    return rakam.collect(collection, metadata)
})

function run() {
    const port = config.get('port')
    app.listen(port, () => {
        logger.info('running on port %d', port)
    })
}

if (module === require.main) {
    let numWorkers = config.get('num_workers')
    if (numWorkers === 0) {
        numWorkers = os.cpus().length
    }
    if (numWorkers > 1) {
        if (cluster.isMaster) {
            logger.info('spawning %d workers', numWorkers)
            for (let i = 0; i < numWorkers; i++) {
                cluster.fork()
            }
        } else {
            run()
        }
    } else {
        run()
    }
}