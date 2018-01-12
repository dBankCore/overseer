import 'mocha'
import * as assert from 'assert'
import * as cluster from 'cluster'

const _cluster = cluster as any

import {BatchWriter} from './../src/batch-writer'

describe('BatchWriter', function() {
    this.slow(200)

    it('should batch write', function(done) {
        const mockDb: any = {
            writePoints: async (points) => {
                assert.equal(points.length, 3)
                writer.destroy()
                done()
            }
        }
        const writer = new BatchWriter(mockDb, 50, 50)
        writer.write({measurement: 'foo', fields: {bar: 1}})
        writer.write({measurement: 'foo', fields: {bar: 1}})
        setTimeout(() => {
            writer.write({measurement: 'foo', fields: {bar: 1}})
        }, 5)
    })

    it('should preprocess', function(done) {
        const mockDb: any = {
            writePoints: async (points) => {
                assert.equal(points.length, 1)
                assert.equal(points[0].measurement, 'bar')
                writer.destroy()
                done()
            }
        }
        const writer = new BatchWriter(mockDb, 50, 50)
        writer.preprocess = (points) => [{measurement: 'bar'}]
        writer.write({measurement: 'foo'})
        writer.write({measurement: 'foo'})
    })

    it('should flush when full', function(done) {
        const mockDb: any = {
            writePoints: async (points) => {
                assert.equal(points.length, 100)
                writer.destroy()
                done()
            }
        }
        const writer = new BatchWriter(mockDb, 5000, 100)
        for (var i = 0; i < 150; i++) {
            writer.write({measurement: 'foo'})
        }
    })

    it('should handle write errors', function(done) {
        const mockDb: any = {
            writePoints: async () => {
                throw new Error('Lost connection to mothership')
            }
        }
        const writer = new BatchWriter(mockDb, 10, 100)
        writer.on('error', (error) => {
            assert.equal(error.message, 'Unable to write, lost 1 point(s): Lost connection to mothership')
            writer.destroy()
            done()
        })
        writer.write({measurement: 'foo'})
    })

    it('should work when clustered', function(done) {
        const _process_send = process.send
        process.send = (msg) => {
            if (_cluster.isMaster) { assert.fail('send on master') }
            _cluster.isMaster = true
            _cluster.emit('message', undefined, msg)
            _cluster.isMaster = false
        }

        const masterMockDb: any = {
            writePoints: async (points) => {
                assert.equal(points.length, 4)
                masterWriter.destroy()
                childWriter.destroy()
                process.send = _process_send
                done()
            }
        }
        const masterWriter = new BatchWriter(masterMockDb, 50, 50)

        _cluster.isMaster = false

        const childMockDb: any = {
            writePoints: async () => { assert.fail('write on child') }
        }
        const childWriter = new BatchWriter(childMockDb, 50, 50)
        childWriter.write({measurement: 'child'})
        childWriter.write({measurement: 'child'})

        _cluster.isMaster = true

        masterWriter.write({measurement: 'master'})
        masterWriter.write({measurement: 'master'})
    })

})
