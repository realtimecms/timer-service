const App = require("@live-change/framework")
const validators = require("../validation")
const app = new App()
const uuid = require('uuid')

const definition = app.createServiceDefinition({
  name: "timer",
  validators
})

let queueDuration = 1 * 60 * 1000
let loadMoreAfter = Math.floor(queueDuration / 2)

let timersQueue = []
let timersById = new Map()
let timersLoopStarted = false
let timersLoopTimeout = false
let lastLoadTime = 0


const Timer = definition.model({
  name: "Timer",
  properties: {
    timestamp: {
      type: Number
    },
    loops: {
      type: Number
    },
    interval: {
      type: Number
    },
    maxRetries: {
      type: Number
    },
    retryDelay: {
      type: Number
    },
    retries: {
      type: Number
    },
    service: {
      type: String
    },
    command: {
      type: Object
    },
    trigger: {
      type: Object
    },
    origin: {
      type: Object
    }
  },
  indexes: {
    timestamp: {
      property: 'timestamp',
      function: async function(input, output) {
        const mapper = (obj) => ({ id: (''+obj.timestamp).padStart(16, '0') + '_' + obj.id, to: obj.id })
        await input.table('timer_Timer').onChange(
            (obj, oldObj) => output.change(obj && mapper(obj), oldObj && mapper(oldObj))
        )
      }
    }
  }
})



function fireTimer(timer) {
  runTimerAction(timer).catch(error => {
    console.error("TIMER ACTION ERROR", error)
    let timestamp = Date.now() + timer.retryDelay
    timer.retries ++
    if(timer.retries > timer.maxRetries) {
      app.emitEvents("timer", [{
        type: "timerFinished",
        timer: timer.id,
        error
      }], { ...(timer.origin || {}), through: 'timer' })
      timersById.delete(timer.id)
    } else { // Retry
      app.emitEvents("timer", [{
        type: "timerFailed",
        timer: timer.id,
        error, timestamp,
        retries: timer.retries
      }], { ...(timer.origin || {}), through: 'timer' })
      timer.timestamp = timestamp
      insertTimer(timer)
    }
  }).then(done => {
    console.error("TIMER ACTION FINISHED", done)
    timer.loops --
    if(timer.loops < 0) {
      console.log("TIMER FINISHED")
      app.emitEvents("timer",[{
        type: "timerFinished",
        timer: timer.id
      }], { ...(timer.origin || {}), through: 'timer' })
      timersById.delete(timer.id)
    } else {
      let timestamp = timer.timestamp + timer.interval
      console.log("TIMER FIRED")
      app.emitEvents("timer",[{
        type: "timerFired",
        timer: timer.id,
        timestamp,
        loops: timer.loops
      }], { ...(timer.origin || {}), through: 'timer' })
      timer.timestamp = timestamp
      insertTimer(timer)
    }
  })
}

async function timersLoop() {
  console.log("TL", timersQueue.length, timersQueue[0] && (timersQueue[0].timestamp - Date.now()))
  timersLoopTimeout = false
  if(timersQueue.length == 0) {
    timersLoopStarted = false
    setTimeout(checkIfThereIsMore, loadMoreAfter)
    return
  }
  let nextTs = timersQueue[0].timestamp
  let now = Date.now()
  while(nextTs < now) {
    fireTimer(timersQueue.shift())
    if(timersQueue.length == 0) {
      timersLoopStarted = false
      setTimeout(checkIfThereIsMore, loadMoreAfter)
      return
    }
    nextTs = timersQueue[0].timestamp
  }
  let delay = nextTs - Date.now()
  if(delay > 1000) delay = 1000
  await maybeLoadMore()
  if(timersLoopTimeout === false) {
    timersLoopTimeout = setTimeout(timersLoop, delay)
  }
}

function startTimersLoop() {
  timersLoopStarted = true
  timersLoop()
}

function resetTimersLoop() {
  if(timersLoopTimeout !== false) clearTimeout(timersLoopTimeout)
  timersLoop()
}

function appendTimers(timers) {
  for(let timer of timers) {
    if(!timersById.has(timer.id)) {
      timersQueue.push(timer)
      timersById.set(timer.id, timer)
    }
  }
}

async function maybeLoadMore() {
  if(!(lastLoadTime - Date.now() < loadMoreAfter)) return
  let loadTime = Date.now() + queueDuration
  let timers = await app.dao.get(['database', 'query', app.databaseName, `(${
      async (input, output, { encodedFrom, encodedTo }) => {
        const mapper = async (res) => input.table('timer_Timer').object(res.to).get()
        await input.index('timer_Timer_timestamp').range({
          gte: encodedFrom,
          lt: encodedTo
        }).onChange(async (obj, oldObj) => {
          output.change(obj && await mapper(obj), oldObj && await mapper(oldObj))
        })
      }
  })`, { encodedFrom: (''+lastLoadTime).padStart(16, '0')+'_', encodedTo: (''+loadTime).padStart(16, '0')+'_' }])
  lastLoadTime = loadTime
  for(let timer of timers) {
    insertTimer(timer)
  }
}

async function checkIfThereIsMore() {
  if(timersLoopStarted) return // loop started
  let loadTime = Date.now() + queueDuration
  //console.log("CHECK IF THERE IS MORE?", loadTime)
  let timers = await app.dao.get(['database', 'query', app.databaseName, `(${
      async (input, output, { encodedFrom, encodedTo }) => {
        const mapper = async (res) => input.table('timer_Timer').object(res.to).get()
        await input.index('timer_Timer_timestamp').range({
          gte: encodedFrom,
          lt: encodedTo
        }).onChange(async (obj, oldObj) => {
          output.change(obj && await mapper(obj), oldObj && await mapper(oldObj))
        })
      }
  })`, { encodedFrom: '', encodedTo: (''+loadTime).padStart(16, '0')+'_' }])
  if(timers.length == 0) {
    //console.log("NO MORE")
    if(!timersLoopStarted) setTimeout(checkIfThereIsMore, loadMoreAfter)
    return
  }
  lastLoadTime = loadTime
  appendTimers(timers)
  if(!timersLoopStarted) startTimersLoop()
}


async function startTimers() {
  console.error("START TIMERS")

  let loadTime = Date.now() + queueDuration

  let timers = await app.dao.get(['database', 'query', app.databaseName, `(${
      async (input, output, { encodedFrom, encodedTo }) => {
        const mapper = async (res) => input.table('timer_Timer').object(res.to).get()
        await input.index('timer_Timer_timestamp').range({
          gte: encodedFrom,
          lt: encodedTo
        }).onChange(async (obj, oldObj) => {
          output.change(obj && await mapper(obj), oldObj && await mapper(oldObj))
        })
      }
  })`, { encodedFrom: '', encodedTo: (''+loadTime).padStart(16, '0')+'_' }])
  console.error("NEXT TIMERS", timers)
  lastLoadTime = loadTime
  appendTimers(timers)
  if(!timersLoopStarted) startTimersLoop()
}

function runTimerAction(timer) {
  console.error("RUN ACTION", timer)
  if(timer.command) {
    if(!timer.command.service) timer.command.service = timer.service
    return app.command({
      ...timer.command,
      origin: { ...(timer.origin || {}), through: "timer" }
    })
  }
  if(timer.trigger) {
    if(timer.service) {
      return app.triggerService(timer.service, {
        ...timer.trigger,
        origin: { ...(timer.origin || {}), through: "timer" }
      })
    } else {
      return app.trigger({
        ...timer.trigger,
        origin: { ...(timer.origin || {}), through: "timer" }
      })
    }
  }
  return new Promise((resolve, reject) => resolve(true))
}

function insertTimer(timer) {
  console.log("INSERT TIMER", timer, "TO", timersQueue)
  timersById.set(timer.id, timer)
  for(let i = 0; i < timersQueue.length; i++) {
    if(timer.timestamp < timersQueue[i].timestamp) {
      timersQueue.splice(i, 0, timer)
      if(i == 0) { // reset timers loop
        resetTimersLoop()
      }
      return;
    }
  }
  timersQueue.push(timer)
  if(!timersLoopStarted) {
    startTimersLoop()
  } else if(timer.timestamp - Date.now() < 1000) {
    resetTimersLoop()
  }
}

function removeTimer(timerId) {
  for(let i = 0; i < timersQueue; i++) {
    if(timersQueue[i].id == timerId) {
      timersQueue.splice(i, 1)
    }
  }
  timersById.delete(timerId)
}

definition.trigger({
  name: "createTimer",
  properties: {
    timer: {
      type: Object
    }
  },
  async execute({ timer }, { client, service }, emit) {
    console.log("CREATE TIMER", timer)
    if(!timer) throw new Error("timer is required")
    let timestamp = timer.timestamp
    let loops = timer.loops || 0
    let timerId = timer.id || uuid.v4()
    let maxRetries = timer.maxRetries || 0
    let retryDelay = timer.retryDelay || 5 * 1000
    let interval = timer.interval || 0
    if(loops > 0 && interval == 0) throw new Error("impossibleTimer")
    const props = {
      ...timer, timestamp, loops, interval, timerId, maxRetries, retryDelay, retries: 0
    }
    emit({
      type: "timerCreated",
      timer: timerId,
      data: props
    })
    if(timestamp < Date.now() + queueDuration) {
      insertTimer({ ...props , id: timerId })
    }
    return timerId
  }
})


definition.trigger({
  name: "cancelTimer",
  properties: {
    timer: {
      type: Timer
    }
  },
  async execute({ timer }, { client, service }, emit) {
    if(!timer) throw new Error("timer is required")
    let timerRow = await Timer.get(timer)
    if(!timerRow) throw 'notFound'
    emit({
      type: "timerCanceled", timer
    })
    removeTimer(timer)
    return true
  }
})

definition.trigger({
  name: "cancelTimerIfExists",
  properties: {
    timer: {
      type: Timer
    }
  },
  async execute({ timer }, { client, service }, emit) {
    if(!timer) throw new Error("timer is required")
    let timerRow = await Timer.get(timer)
    if(!timerRow) return false
    emit({
      type: "timerCanceled", timer
    })
    removeTimer(timer)
    return true
  }
})


definition.action({
  name: "create",
  properties: {
    timer: {
      type: Object
    }
  },
  async execute({ timer }, { client, service }, emit) {
    if(!timer) throw new Error("timer is required")
    let timestamp = timer.timestamp
    let loops = timer.loops || 0
    let timerId = timer.id || uuid.v4()
    let maxRetries = timer.maxRetries || 0
    let retryDelay = timer.retryDelay || 5 * 1000
    let interval = timer.interval || 0
    if(loops > 0 && interval == 0) throw new Error("impossibleTimer")
    const props = {
      ...timer, timestamp, loops, interval, timerId, maxRetries, retryDelay, retries: 0
    }
    emit({
      type: "timerCreated",
      timer: timerId,
      data: props
    })
    if(timestamp < Date.now() + queueDuration) {
      insertTimer({ ...props , id: timerId })
    }
    return timerId
  }
})


definition.action({
  name: "cancel",
  properties: {
    timer: {
      type: Timer
    }
  },
  async execute({ timer }, { client, service }, emit) {
    if(!timer) throw new Error("timer is required")
    let timerRow = await Timer.get(timer)
    if(!timerRow) throw 'notFound'
    emit({
      type: "timerCanceled", timer
    })
    removeTimer(timer)
    return true
  }
})

definition.action({
  name: "cancelIfExists",
  properties: {
    timer: {
      type: Timer
    }
  },
  async execute({ timer }, { client, service }, emit) {
    if(!timer) throw new Error("timer is required")
    let timerRow = await Timer.get(timer)
    if(!timerRow) return false
    emit({
      type: "timerCanceled", timer
    })
    removeTimer(timer)
    return true
  }
})

definition.event({
  queuedBy: 'timer',
  name: "timerCreated",
  async execute({ timer, data, origin }) {
    return Timer.create({
      id: timer,
      ...data,
      origin: { ...origin, ...( data.origin || {} ) }
    })
  }
})

definition.event({
  queuedBy: 'timer',
  name: "timerCanceled",
  async execute({ timer }) {
    return Timer.delete(timer)
  }
})

definition.event({
  queuedBy: 'timer',
  name: "timerFinished",
  async execute({ timer }) {
    return Timer.delete(timer)
  }
})

definition.event({
  queuedBy: 'timer',
  name: "timerFired",
  async execute({ timer, timestamp, loops }) {
    return Timer.update(timer, {
      loops, timestamp
    })
  }
})

definition.event({
  queuedBy: 'timer',
  name: "timerFailed",
  async execute({ timer, timestamp, retries }) {
    return Timer.update(timer, {
      retries, timestamp
    })
  }
})


module.exports = definition

async function start() {
  app.processServiceDefinition(definition, [ ...app.defaultProcessors ])
  await app.updateService(definition)//, { force: true })
  const service = await app.startService(definition, { runCommands: true, handleEvents: true })

  await startTimers()
  /*require("../config/metricsWriter.js")(definition.name, () => ({

  }))*/
}

if (require.main === module) start().catch( error => { console.error(error); process.exit(1) })

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason)
})
