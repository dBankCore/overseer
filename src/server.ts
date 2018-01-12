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
import {JsonRpcAuth, requestLogger, rpcLogger} from '@steemit/koa-jsonrpc'

import {parseBool, ensureDatabase} from './utils'
import {logger} from './logger'
import {collect, db} from './collector'

export const app = new Koa()

const router = new Router()
const rpc = new JsonRpcAuth(config.get('rpc_node'), config.get('name'))

app.proxy = parseBool(config.get('proxy'))
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

// legacy endpoint, remove when condenser uses collect
rpc.register('pageview', async function(account: string, page: string, referer: string) {
    this.log.info({account, page, referer}, 'recording pageview')
    await collect.call(this, 'pageview', account, {page, referer})
})

rpc.register('collect', collect)
rpc.registerAuthenticated('collect_signed', collect)

function run() {
    const port = config.get('port')
    app.listen(port, () => {
        logger.info('running on port %d', port)
    })
}

if (module === require.main) {
    if (cluster.isMaster) {
        ensureDatabase(db).catch((error) => {
            logger.fatal(error, 'unable to create database')
            setTimeout(() => process.exit(1), 1000)
        })
    }
    let numWorkers = Number.parseInt(config.get('num_workers'))
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