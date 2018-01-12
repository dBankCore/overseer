/**
 * @file InfluxDB stats collector
 * @author Johan Nordberg <johan@steemit.com>
 */

import * as config from 'config'
import {InfluxDB, IPoint} from 'influx'
import * as normalizeUrl from 'normalize-url'
import {JsonRpcAuthMethodContext as JCtx} from '@steemit/koa-jsonrpc'

import {BatchWriter} from './batch-writer'
import {logger as baseLogger} from './logger'

export const db = new InfluxDB(config.get('influxdb_url'))

const logger = baseLogger.child({module: 'batch-writer'})
const writer = new BatchWriter(db, 10000)

writer.on('error', (error) => {
    logger.error(error, 'writer error')
})

writer.on('flush', (points) => {
    logger.info({points}, 'writer flushed')
})

/**
 * Batch preprocessor to consolidate pageviews.
 */
writer.preprocess = (points) => {
    const rv: IPoint[] = []
    const pageviews: {[page: string]: IPoint} = {}
    for (const point of points) {
        if (point.measurement === 'pageview' && point.tags && point.fields) {
            if (pageviews[point.tags.page]) {
                (pageviews[point.tags.page] as any).fields.views += point.fields.views
                continue
            } else {
                pageviews[point.tags.page] = point
            }
        }
        rv.push(point)
    }
    return rv
}

/**
 * Collect data.
 * @param event  Event name, used as influx measurement.
 * @param user  User id number that performed event.
 * @param data  Event payload.
 */
export async function collect(this: JCtx, event: string, user: string|null, data: any) {
    let signed = false
    if (this.account) {
        signed = true
        if (user !== null) {
            this.assert(this.account === user, 'signer does not match user')
        }
    }
    this.assert(typeof event === 'string', 'invalid event name')
    switch (event) {
        case 'pageview': {
            const {page, referer} = data
            this.assert(typeof page === 'string', 'invalid page')
            this.assert(typeof referer === 'string', 'invalid referer')
            writer.write({
                measurement: 'pageview',
                fields: {
                    views: 1
                },
                tags: {
                    signed: signed as any,
                    page: normalizeUrl(page),
                    referer: normalizeUrl(referer),
                }
            })
            break
        }
        case 'signup': {
            const {step} = data
            this.assert(typeof step === 'string', 'invalid step')
            this.assert(typeof user === 'string', 'invalid user')
            writer.write({
                measurement: 'signup',
                fields: {
                    hit: 1
                },
                tags: {
                    signed: signed as any,
                    user: user as any,
                    step,
                }
            })
            break
        }
        default:
            this.assert(false, 'unknown event')
    }
}
