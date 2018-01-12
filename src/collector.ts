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
export const writer = new BatchWriter<IPoint>()

writer.addTransport({
    name: 'influxdb',
    interval: 1000,
    maxItems: 2000,
    write: async (data) => {
        // consolidate pageviews
        const points: IPoint[] = []
        const pageviews: {[page: string]: IPoint} = {}
        for (const point of data) {
            if (point.measurement === 'pageview' && point.tags && point.fields) {
                if (pageviews[point.tags.page]) {
                    (pageviews[point.tags.page] as any).fields.views += point.fields.views
                    continue
                } else {
                    pageviews[point.tags.page] = point
                }
            }
            points.push(point)
        }
        // write points to db
        await db.writePoints(points, {precision: 's'})
    }
})

writer.on('error', (error) => {
    logger.error(error, 'writer error')
})

writer.on('flush', (transport, points) => {
    logger.info({transport, points}, 'writer flushed')
})

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
                timestamp: new Date(),
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
                timestamp: new Date(),
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
