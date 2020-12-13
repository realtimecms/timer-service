const test = require('blue-tape')
const App = require("@live-change/framework")
const app = new App()
const crypto = require('crypto')
const { exec } = require('child_process');

test('Timer service restarts', t => {
  t.plan(5)
  let conn

  let userId = crypto.randomBytes(24).toString('hex')

  let timerId

  t.test('create empty timer', async (t) => {
    t.plan(2)

    timerId = await app.command({
      service: 'timer',
      type: 'create',
      parameters: {
        timer: {
          timestamp: Date.now() + 1*10*1000,
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
  })

  t.test('restart timer service', t => {
    t.plan(1)
    exec('pm2 restart timer-service', (err, stdout, stderr) => {
      if(err) return t.fail(stderr)
      t.pass(stdout)
    })
  })

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
    }, 1*10*1000 + 500)
  })

  t.test('close connection', t => {
    app.dao.dispose()
    t.end()
  })
})