/**
 * @file Pluggable batch writer with clustering support.
 * @author Johan Nordberg <johan@steemit.com>
 */

import * as assert from 'assert'
import * as cluster from 'cluster'
import {EventEmitter} from 'events'
import {InfluxDB, IPoint} from 'influx'
import {VError} from 'verror'

export interface BatchWriterTransport<T> {
    /** Name of the transport. */
    name: string
    /** How often to flush data to transport, in milliseconds. */
    interval: number
    /** Max items per write, writer will flush immediatley when buffer exceeds this. */
    maxItems: number
    /** Write data to underlying transport. */
    write(data: T[]): Promise<void>
}

/**
 * Writes data in batches.
 */
export class BatchWriter<T> extends EventEmitter {

    private transports: {[name: string]: {
        buffer: T[]
        timer: NodeJS.Timer
        transport: BatchWriterTransport<T>
    }}
    private transportNames: string[]

    /**
     * @param name  Instance id, used for inter-process communication.
     *              Change this to something unique to use multiple writer
     *              instances in a clustered setup.
     */
    constructor(public readonly id = 'writer1') {
        super()
        if (cluster.isMaster) {
            this.transports = {}
            this.transportNames = []
            cluster.on('message', this.msgHandler)
        }
    }

    /**
     * Add transport to writer.
     */
    addTransport(transport: BatchWriterTransport<T>) {
        if (cluster.isMaster) {
            const name = transport.name
            const flush = () => { this.flush(name) }
            assert(this.transports[name] === undefined, 'transport names must be unique')
            this.transports[transport.name] = {
                buffer: [],
                timer: setInterval(flush, transport.interval),
                transport,
            }
            this.transportNames.push(name)
        }
    }

    /**
     * Write data... later.
     */
    write(data: T) {
        if (!cluster.isMaster) {
            if (process.send) {
                process.send({data, __id: this.id})
            } else {
                throw new Error(`This can't happen™`)
            }
        } else {
            for (const name of this.transportNames) {
                const {buffer, transport} = this.transports[name]
                buffer.push(data)
                if (buffer.length >= transport.maxItems) {
                    this.flush(name)
                }
            }
        }
    }

    /**
     * Destroy instance.
     * @param flush  Whether to flush all buffers before destroying.
     */
    async destroy(flush = true) {
        if (cluster.isMaster) {
            cluster.removeListener('message', this.msgHandler)
            const writes = this.transportNames.map((name) => {
                const {buffer, transport, timer} = this.transports[name]
                clearInterval(timer)
                if (flush && buffer.length > 0) {
                    return transport.write(buffer)
                } else {
                    return Promise.resolve()
                }
            })
            await Promise.all(writes)
        }
    }

    private msgHandler = (worker, msg) => {
        if (msg.data && msg.__id === this.id) {
            this.write(msg.data)
        }
    }

    private flush = (name: string) => {
        const {buffer, transport} = this.transports[name]
        if (buffer.length > 0) {
            this.transports[name].buffer = []
            process.nextTick(() => {
                transport.write(buffer).then(() => {
                    this.emit('flush', name, buffer.length)
                }, (cause) => {
                    const error = new VError({cause}, 'Unable to write to %s', name)
                    setImmediate(() => { this.emit('error', error) })
                })
            })
        }
    }
}
