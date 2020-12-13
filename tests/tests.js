const test = require('tape')
const App = require("@live-change/framework")
const app = new App()
const crypto = require('crypto')

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason)
})

test('Timer service', t => {

  t.plan(5)

  let conn

  let sessionId = crypto.randomBytes(24).toString('hex')

  t.test('create empty timer', async t => {
    t.plan(3)

    const timerId = await app.command({
      service: 'timer',
      type: 'create',
      parameters: {
        timer: {
          timestamp: Date.now() + 1000,
          service: null,
          command: null
        }
      }
    })

    t.pass("Timer created")

    t.test('check if timer exists', t=> {
      t.plan(1)
      setTimeout(async () => {
        const timerRow = await app.dao.get(['database', 'tableObject', app.databaseName, 'timer_Timer', timerId ])
        if(timerRow) t.pass('timer exists')
          else t.fail('timer not found')
      }, 300)
    })

    t.test('check if timer removed after timestamp', t=> {
      t.plan(1)
      setTimeout(async () => {
        const timerRow = await app.dao.get(['database', 'tableObject', app.databaseName, 'timer_Timer', timerId ])
        if(!timerRow) t.pass('timer removed')
          else t.fail('timer still exits')
      }, 1600)
    })

  })

  t.test('create timer that will create session', async t => {
    t.plan(4)

    const timerId = await app.command({
      service: 'timer',
      type: 'create',
      parameters: {
        timer: {
          timestamp: Date.now() + 1000,
          command: {
            service: "session",
            type: 'createSessionIfNotExists',
            parameters: {
              session: sessionId
            }
          }
        }
      }
    })

    t.pass("Timer created")

    t.test('check if timer exists', t=> {
      t.plan(1)
      setTimeout(async () => {
        const timerRow = await app.dao.get(['database', 'tableObject', app.databaseName, 'timer_Timer', timerId ])
        if(timerRow) t.pass('timer exists')
        else t.fail('timer not found')
      }, 300)
    })

    t.test('check if session exists', t=> {
      t.plan(1)
      setTimeout(async () => {
        const sessionRow = await app.dao.get(['database', 'tableObject', app.databaseName, 'session_Session', sessionId ])
        if(sessionRow) t.pass('session exists')
        else t.fail('session not found')
      }, 1500)
    })

    t.test('check if timer removed after timestamp', t=> {
      t.plan(1)
      setTimeout(async () => {
        const timerRow = await app.dao.get(['database', 'tableObject', app.databaseName, 'timer_Timer', timerId ])
        if(!timerRow) t.pass('timer removed')
        else t.fail('timer still exits')
      }, 1600)
    })

  })

  let timerId

  t.test('create empty interval', async t => {
    t.plan(3)

    timerId = await app.command({
      service: 'timer',
      type: 'create',
      parameters: {
        timer: {
          timestamp: Date.now() + 1000,
          loops: 10,
          interval: 1000,
          service: null,
          command: null
        }
      }
    })

    t.pass("timer created")

    t.test('check if timer exists', t=> {
      t.plan(1)
      setTimeout(async () => {
        const timerRow = await app.dao.get(['database', 'tableObject', app.databaseName, 'timer_Timer', timerId ])
        if(timerRow) t.pass('timer exists')
        else t.fail('timer not found')
        console.log("TR1", timerRow)
      }, 300)
    })

    t.test('check if timer loops decrased after timestamp', t=> {
      t.plan(2)
      setTimeout(async () => {
        const timerRow = await app.dao.get(['database', 'tableObject', app.databaseName, 'timer_Timer', timerId ])
        if(timerRow) t.pass('timer exists')
        else t.fail('timer not found')
        console.log("TR", timerRow)
        t.equal(timerRow.loops, 9, "Loops decrased")
      }, 1500)
    })

  })

  t.test("remove interval", async t=> {
    t.plan(2)

    timerId = await app.command({
      service: 'timer',
      type: 'cancel',
      parameters: {
        timer: timerId
      }
    })

    t.pass("canceled")

    t.test('check if timer removed after cancellation', t=> {
      t.plan(1)
      setTimeout(async () => {
        const timerRow = await app.dao.get(['database', 'tableObject', app.databaseName, 'timer_Timer', timerId ])
        if(!timerRow) t.pass('timer removed')
        else t.fail('timer still exits')
      }, 1600)
    })
  })

  t.test('close', t=>{
    app.dao.dispose()
    t.end()
  })


})