import 'mocha'
import * as assert from 'assert'
import * as cluster from 'cluster'

const _cluster = cluster as any

import {BatchWriter} from './../src/batch-writer'

describe('BatchWriter', function() {
    this.slow(200)

    it('should batch write', function(done) {
        const writer = new BatchWriter('foo1')
        writer.addTransport({
            name: 'foo',
            interval: 10,
            maxItems: 10,
            write: async (data) => {
                assert.equal(data.length, 3)
                writer.destroy()
                done()
            }
        })
        writer.write({measurement: 'foo', fields: {bar: 1}})
        writer.write({measurement: 'foo', fields: {bar: 1}})
        setTimeout(() => {
            writer.write({measurement: 'foo', fields: {bar: 1}})
        }, 5)
    })

    it('should flush when full', function(done) {
        const writer = new BatchWriter('foo2')
        writer.addTransport({
            name: 'foo',
            interval: 5000,
            maxItems: 100,
            write: async (data) => {
                assert.equal(data.length, 100)
                writer.destroy(false)
                done()
            }
        })
        for (var i = 0; i < 150; i++) {
            writer.write({measurement: 'foo'})
        }
    })

    it('should handle write errors', function(done) {
        const writer = new BatchWriter('foo3')
        writer.addTransport({
            name: 'foo',
            interval: 10,
            maxItems: 100,
            write: async (data) => {
                throw new Error('Lost connection to mothership')
            }
        })
        writer.on('error', (error) => {
            assert.equal(error.message, 'Unable to write to foo: Lost connection to mothership')
            writer.destroy(false)
            done()
        })
        writer.write({measurement: 'foo'})
    })

    it('should flush when destroyed', async function() {
        const writer = new BatchWriter('foo4')
        let writeData
        writer.addTransport({
            name: 'foo',
            interval: 2000,
            maxItems: 100,
            write: async (data) => {
                if (writeData) assert.fail('write more than once')
                writeData = data
            }
        })
        writer.write({measurement: 'foo'})
        writer.write({measurement: 'foo'})
        await writer.destroy()
        assert.equal(writeData.length, 2)
    })

    it('should work when clustered', function(done) {
        const _process_send = process.send
        process.send = (msg) => {
            if (cluster.isMaster) { assert.fail('send on master') }
            _cluster.isMaster = true
            _cluster.emit('message', undefined, msg)
            _cluster.isMaster = false
        }

        const transport = {
            name: 'foo',
            interval: 10,
            maxItems: 10,
            write: async (data) => {
                assert(cluster.isMaster, 'transport write should happen on master')
                assert.equal(data.length, 4)
            }
        }

        const masterWriter = new BatchWriter('foo-cluster1')
        masterWriter.addTransport(transport)
        masterWriter.on('flush', () => {
            masterWriter.destroy(false)
            _cluster.isMaster = false
            childWriter.destroy(false)
            _cluster.isMaster = true
            done()
        })

        _cluster.isMaster = false

        const childWriter = new BatchWriter('foo-cluster1')
        childWriter.addTransport(transport)

        childWriter.write({measurement: 'child'})
        childWriter.write({measurement: 'child'})

        _cluster.isMaster = true

        masterWriter.write({measurement: 'master'})
        masterWriter.write({measurement: 'master'})
    })

})
