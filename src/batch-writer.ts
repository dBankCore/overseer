/**
 * @file InfluxDB batch writer.
 * @author Johan Nordberg <johan@steemit.com>
 */

import * as cluster from 'cluster'
import {EventEmitter} from 'events'
import {InfluxDB, IPoint} from 'influx'
import {VError} from 'verror'

/**
 * Writes InfluxDB points in batches.
 */
export class BatchWriter extends EventEmitter {

    private buffer: IPoint[] = []
    private timer: NodeJS.Timer
    private id: number

    /**
     * Optional preprocessor, called with all points in buffer before it is flushed.
     */
    public preprocess?: (points: IPoint[]) => IPoint[]

    /**
     * @param db  InfluxDB instance.
     * @param flushInterval  How often to write data to databse, in milliseconds.
     * @param maxSize  How many points to keep in memory before forcing a write.
     * @param name  Name of shared buffer, used for inter-process communication.
     *              Only has to be changed if you plan on using multiple
     *              BatchWriter instances in the same process.
     */
    constructor(
        public readonly db: InfluxDB,
        public readonly flushInterval = 1000,
        public readonly maxSize = 2000,
        public readonly name = 'writer1',
    ) {
        super()
        if (cluster.isMaster) {
            cluster.on('message', this.msgHandler)
            this.timer = setInterval(this.flush, flushInterval)
        }
    }

    /**
     * Write point to database... later.
     * @param point  The point to write, point.timestamp will be set to now if missing.
     */
    write(point: IPoint) {
        if (!cluster.isMaster) {
            if (process.send) {
                process.send({point, __name: this.name})
            } else {
                throw new Error(`This can't happen™`)
            }
        } else {
            if (!point.timestamp) {
                point.timestamp = new Date()
            }
            this.buffer.push(point)
            if (this.buffer.length >= this.maxSize) {
                this.flush()
            }
        }
    }

    /**
     * Destroy instance.
     */
    destroy() {
        clearInterval(this.timer)
        cluster.removeListener('message', this.msgHandler)
    }

    private msgHandler = (worker, msg) => {
        if (msg.point && msg.__name === this.name) {
            this.write(msg.point)
        }
    }

    private flush = () => {
        const points = this.buffer
        this.buffer = []
        if (points.length > 0) {
            process.nextTick(() => {
                let p = this.preprocess ? this.preprocess(points) : points
                this.db.writePoints(p, {precision: 's'}).then(() => {
                    this.emit('flush', p.length)
                }).catch((cause) => {
                    const error = new VError({cause}, 'Unable to write, lost %d point(s)', p.length)
                    this.emit('error', error)
                })
            })
        }
    }
}
