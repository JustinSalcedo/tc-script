function main() {
    // Utils
    function mergeObjects(baseObj, incomingObj) {
        Object.keys(incomingObj).forEach(key => {
            if (typeof incomingObj[key] !== 'undefined')
                baseObj[key] = incomingObj[key]
        })
    }

    function parseVariableName(name) {
        return name.toLowerCase().replace('-', '')
    }

    function makeLoggable(fn, log = true) {
        return log ? console.log(fn()) : fn()
    }

    function generateId() {
        return Math.floor(Math.random() * 1e13).toString()
    }

    function genLookupMap(arr) {
        const objMap = {}
        arr.forEach(item => (objMap[item.id] = item))
        return objMap
    }

    // - Main

    // interface CreateTestCaseDto

    // DAOs
    class Dao {
        index = []

        constructor(indexPrefix) {
            this.indexPrefix = indexPrefix
            const loadedIndex = this.loadIndex()
            if (!loadedIndex) this.setIndex([])
            else this.index = loadedIndex
        }

        get indexKey() {
            return `${this.indexPrefix}.index`
        }

        loadIndex() {
            const index = localStorage.getItem(this.indexKey)
            return index ? JSON.parse(index) : null
        }

        setIndex(index) {
            localStorage.setItem(this.indexKey, JSON.stringify(index))
        }

        addToIndex(id) {
            this.index.push(id)
            localStorage.setItem(this.indexKey, JSON.stringify(this.index))
        }

        addManyToIndex(ids) {
            this.index.push(...ids)
            localStorage.setItem(this.indexKey, JSON.stringify(this.index))
        }

        removeFromIndex(id) {
            const idIdx = this.index.findIndex(foundId => foundId === id)
            if (idIdx === -1) return

            this.index.splice(idIdx, 1)
            localStorage.setItem(this.indexKey, JSON.stringify(this.index))
        }

        getIdKey(id) {
            return `${this.indexPrefix}.${id}`
        }

        findById(id) {
            const record = localStorage.getItem(this.getIdKey(id))
            if (record) return {...JSON.parse(record), id}
        }

        findManyById(ids) {
            const records = []
            ids.forEach(id => {
                const record = this.findById(id)
                if (record) records.push(record)
            })

            return records
        }

        getAll() {
            // const trimmedIndex = this.index.slice(0, count)
            // return trimmedIndex
            return this.index
                .map(id => this.findById(id))
                .filter(record => !!record)
        }

        createOne({id, ...data}) {
            localStorage.setItem(this.getIdKey(id), JSON.stringify(data))
            this.addToIndex(id)
        }

        createMany(cases) {
            cases.forEach(({id, ...data}) =>
                localStorage.setItem(this.getIdKey(id), JSON.stringify(data)),
            )
            this.addManyToIndex(cases.map(({id}) => id))
        }

        updateById(id, data) {
            const foundRecord = this.findById(id)
            if (!foundRecord)
                throw new Error(`Could not update ${this.indexPrefix} record`)

            const updatedRecord = {...foundRecord}
            mergeObjects(updatedRecord, data)
            localStorage.setItem(
                this.getIdKey(id),
                JSON.stringify(updatedRecord),
            )
        }

        deleteById(id) {
            localStorage.removeItem(this.getIdKey(id))
            this.removeFromIndex(id)
        }

        deleteAll() {
            this.index.forEach(id => localStorage.removeItem(this.getIdKey(id)))
            this.index = []
            this.setIndex([])
        }
    }

    class TestCaseDao extends Dao {
        static INDEX_PREFIX = 'testCase'

        constructor() {
            super(TestCaseDao.INDEX_PREFIX)
        }
    }

    class ExecutionDao extends Dao {
        static INDEX_PREFIX = 'execution'

        constructor() {
            super(ExecutionDao.INDEX_PREFIX)
        }
    }

    class SettingsDao extends Dao {
        static INDEX_PREFIX = 'settings'

        constructor() {
            super(SettingsDao.INDEX_PREFIX)
        }
    }

    // Stores
    class Execution {
        id = ''
        env = ''
        result = null
        time = new Date()
        notes = null

        constructor({execution, store}) {
            mergeObjects(this, execution)
            this.store = store
            this.dao = this.store.dao
        }

        get asCopyData() {
            return {
                env: this.env,
                result: this.result,
                timeInMs: this.time.getTime(),
                notes: this.notes,
            }
        }

        get asCopy() {
            return {...this.asCopyData, id: this.id}
        }

        get info() {
            return (
                `${this.env.toUpperCase()} (${this.result || 'not run'})` +
                (this.notes ? `: ${this.notes}` : '')
            )
        }

        update(data) {
            mergeObjects(this, data)
            this.dao.updateById(this.id, this.asCopyData)
        }

        setNotes(notes) {
            this.update({notes})
        }

        pass(notes, time = new Date()) {
            this.update({notes, time, result: 'passed'})
        }

        fail(notes, time = new Date()) {
            this.update({notes, time, result: 'failed'})
        }

        block(notes, time = new Date()) {
            this.update({notes, time, result: 'blocked'})
        }

        uncheck() {
            this.update({result: null})
        }
    }

    class ExecutionStore {
        constructor({dao, rootStore}) {
            this.dao = dao
            this.rootStore = rootStore
        }

        get defaultEnv() {
            return this.rootStore.settings.env
        }

        autoCreate({result = null, time = new Date(), notes = null}) {
            return this.create({
                id: generateId(),
                result,
                time,
                notes,
                env: this.defaultEnv,
            })
        }

        create(execution) {
            const instance = this.genExecution(execution)
            this.dao.createOne(instance.asCopy)

            return instance
        }

        createMany(executions) {
            const instances = executions.map(execution =>
                this.genExecution(execution),
            )
            this.dao.createMany(instances.map(({asCopy}) => asCopy))

            console.log(`${instances.length} executions added`)
            return instances
        }

        import(copies) {
            const instances = copies.map(copy =>
                this.genExecution(parseExecutionFromCopy(copy)),
            )
            this.dao.createMany(copies)

            console.log(`${instances.length} executions added`)
            return instances
        }

        getOneById(id) {
            const copy = this.dao.findById(id)
            if (!copy) return

            return this.genExecution(parseExecutionFromCopy(copy))
        }

        getManyById(ids) {
            return this.dao
                .findManyById(ids)
                .map(copy => this.genExecution(parseExecutionFromCopy(copy)))
        }

        genExecution(execution) {
            return new Execution({execution, store: this})
        }
    }

    function parseExecutionFromCopy({timeInMs, ...copy}) {
        return {...copy, time: new Date(timeInMs)}
    }

    class TestCase {
        id = ''
        executions = {}

        constructor({testCase, store}) {
            mergeObjects(this, testCase)

            this.store = store
            this.dao = this.store.dao
        }

        get executed() {
            return !!this.executionList.length
        }

        get asCopyData() {
            const executionIds = {}
            Object.entries(this.executions).forEach(
                ([env, {id}]) => (executionIds[env] = id),
            )

            return {
                executionIds,
            }
        }

        get asCopy() {
            return {
                ...this.asCopyData,
                id: this.id,
            }
        }

        get executionList() {
            return Object.values(this.executions)
        }

        get info() {
            if (!this.executed) return `${this.id} (not run)`

            const executionList = this.executionList
            if (executionList.length === 1)
                return `${this.id} - ${executionList[0].info}`

            return `${this.id}\n\t- ${executionList
                .map(execution => execution.info)
                .join('\n\t- ')}`
        }

        get variableName() {
            return parseVariableName(this.id)
        }

        get defaultEnv() {
            return this.store.rootStore.settings.env
        }

        get executionStore() {
            return this.store.rootStore.executionStore
        }

        getExecution(env) {
            if (this.executions[env]) return this.executions[env]
        }

        setResult(result, notes, time) {
            const existingExecution = this.getExecution(this.defaultEnv)
            const targetExecution =
                existingExecution ||
                this.executionStore.autoCreate({result, time, notes})

            targetExecution.update({result, notes, time})

            if (existingExecution) return

            this.executions[this.defaultEnv] = targetExecution
            this.dao.updateById(this.id, this.asCopyData)
        }

        pass(notes, time) {
            this.setResult('passed', notes, time)
        }

        fail(notes, time) {
            this.setResult('failed', notes, time)
        }

        block(notes, time) {
            this.setResult('blocked', notes, time)
        }

        uncheck() {
            this.setResult(null, null)
        }
    }

    class TestCaseStore {
        testCases = []

        constructor({dao, rootStore}) {
            this.dao = dao
            this.rootStore = rootStore

            this.init()
        }

        init() {
            this.loadTestCases()
        }

        loadTestCases() {
            const copies = this.dao.getAll()
            const allExecutions = this.rootStore.executionStore.getManyById(
                copies.flatMap(({executionIds}) => Object.values(executionIds)),
            )
            const allExecutionsMap = genLookupMap(allExecutions)

            this.testCases = copies.map(({id, executionIds}) => {
                const executions = {}
                Object.entries(executionIds).forEach(([env, id]) => {
                    const execution = allExecutionsMap[id]
                    if (execution) executions[env] = execution
                })

                return this.genTestCase({id, executions})
            })
        }

        create(testCase) {
            const instance = this.genTestCase(testCase)
            this.testCases.push(instance)
            this.dao.createOne(instance.asCopy)
            return instance
        }

        createMany(testCases) {
            const instances = testCases.map(testCase =>
                this.genTestCase(testCase),
            )
            this.testCases.push(...instances)
            this.dao.createMany(instances.map(({asCopy}) => asCopy))

            console.log(`${instances.length} test cases added`)
            return instances
        }

        import(copies) {
            const executionCopies = copies.flatMap(({executionCopies}) =>
                Object.values(executionCopies),
            )
            const importedExecutions =
                this.rootStore.executionStore.import(executionCopies)
            const importedExecutionsMap = genLookupMap(importedExecutions)

            this.testCases = copies.map(({id, executionCopies}) => {
                const executionIds = Object.values(executionCopies).map(
                    ({id}) => id,
                )
                const executions = {}
                Object.entries(executionIds).forEach(([env, id]) => {
                    const execution = importedExecutionsMap[id]
                    if (execution) executions[env] = execution
                })

                return this.genTestCase({id, executions})
            })

            console.log(`${copies.length} test cases added`)
        }

        // import

        getAllExecuted() {
            return this.testCases.filter(({executed}) => executed)
        }

        getAllNotRun() {
            return this.testCases.filter(({executed}) => !executed)
        }

        genTestCase(testCase) {
            return new TestCase({testCase, store: this})
        }

        getAllByResult(result, env) {
            if (result)
                return this.getAllExecuted().filter(
                    ({executions}) =>
                        !!Object.entries(executions).find(
                            ([key, execution]) =>
                                (!env || env === key) &&
                                execution?.result === result,
                        ),
                )
            return this.getAllNotRun()
        }

        getRandomNotRun() {
            const allNotRun = this.getAllNotRun()
            const count = allNotRun.length

            if (!count) return

            const randomIndex = Math.floor(count * Math.random())
            return allNotRun[randomIndex]
        }

        getOneById(id) {
            return this.testCases.find(({id: foundId}) => foundId === id)
        }

        getReport(env) {
            const casesDone = this.getAllExecuted()
            const failed = this.getAllByResult('failed', env)
            const blocked = this.getAllByResult('blocked', env)
            const passed = this.getAllByResult('passed', env)

            const failedText = failed.length
                ? `\n\nFailed:` + `\n${this.makeList(failed)}`
                : ''
            const blockedText = blocked.length
                ? `\n\nBlocked:` + `\n${this.makeList(blocked)}`
                : ''
            const passedText = passed.length
                ? `\n\nPassed:` + `\n${this.makeList(passed)}`
                : ''

            return (
                `${env.toUpperCase()} - Test cases run: ${casesDone.length}` +
                `\n\tpassed: ${passed.length}; failed: ${failed.length}; blocked: ${blocked.length}` +
                failedText +
                blockedText +
                passedText
            )
        }

        list(limit) {
            const list = limit ? this.testCases.slice(0, limit) : this.testCases
            return list
                .map(
                    testCase =>
                        `- [${testCase.executed ? 'x' : ' '}] ` + testCase.info,
                )
                .join('\n')
        }

        listExecuted() {
            return this.makeList(this.getAllExecuted())
        }

        listNotRun() {
            return this.makeList(this.getAllNotRun())
        }

        listByResult(result) {
            return this.makeList(this.getAllByResult(result))
        }

        makeList(testCases) {
            return testCases.map(testCase => `- ${testCase.info}`).join('\n')
        }

        deleteAll() {
            this.testCases = []
            this.dao.deleteAll()
        }
    }

    class Settings {
        _id = null
        predefinedEnvs = []
        _env = null

        constructor({dao, rootStore}) {
            this.dao = dao
            this.rootStore = rootStore

            this.init()
        }

        /**
         * @throws 'No environment set'
         */
        get env() {
            if (!this._env) throw new Error('No environment set')
            return this._env
        }

        init() {
            this.loadValues()
        }

        loadValues() {
            const settings = this.dao.getAll()[0]
            if (!settings) {
                const id = generateId()
                this._id = id
                this.dao.createOne({...this.asCopyData, id})
                return
            }

            const {id, predefinedEnvs, env} = settings
            this._id = id
            this.predefinedEnvs = predefinedEnvs
            this._env = env
        }

        get asCopyData() {
            return {
                predefinedEnvs: this.predefinedEnvs,
                env: this._env,
            }
        }

        update({predefinedEnvs, env}) {
            if (predefinedEnvs) this.predefinedEnvs = predefinedEnvs
            if (typeof env !== 'undefined') this._env = env

            if (this._id) this.dao.updateById(this._id, this.asCopyData)
        }

        setEnv(env) {
            this.update({env})
        }

        setPredefinedEnvs(predefinedEnvs) {
            this.update({predefinedEnvs})
        }
    }

    class RootStore {
        constructor({executionDao, testCaseDao, settingsDao}) {
            this.executionStore = new ExecutionStore({
                dao: executionDao,
                rootStore: this,
            })
            this.testCaseStore = new TestCaseStore({
                dao: testCaseDao,
                rootStore: this,
            })
            this.settings = new Settings({
                dao: settingsDao,
                rootStore: this,
            })
        }
    }

    // Main
    const executionDao = new ExecutionDao()
    const testCaseDao = new TestCaseDao()
    const settingsDao = new SettingsDao()

    const rootStore = new RootStore({executionDao, testCaseDao, settingsDao})
    const settings = rootStore.settings
    const testCaseStore = rootStore.testCaseStore

    const genTestCaseMap = testCase => {
        const map = {}
        map[testCase.variableName] = testCase
        return map
    }

    const addTestCaseToDom = testCase => {
        const map = genTestCaseMap(testCase)
        mergeObjects(window, map)
    }

    mergeObjects(window, {
        setAvailableEnvironments: envs => settings.setPredefinedEnvs(envs),
        setEnvironment: env => settings.setEnv(env),
        createCase: id => {
            const testCase = testCaseStore.create({id, executions: {}})
            addTestCaseToDom(testCase)
            return testCase.info
        },
        createCases: (ids, addToDom = false) => {
            const testCases = testCaseStore.createMany(
                ids.map(id => ({id, executions: {}})),
            )
            if (addToDom)
                testCases.forEach(testCase => addTestCaseToDom(testCase))
        },
        importCases: testCases => testCaseStore.import(testCases),
        getCases: () => testCaseStore.testCases,
        listCases: (log, count) =>
            makeLoggable(() => testCaseStore.list(count), log),
        listCasesDone: log =>
            makeLoggable(() => testCaseStore.listExecuted(), log),
        listCasesNotRun: log =>
            makeLoggable(() => testCaseStore.listNotRun(), log),
        listPassedCases: log =>
            makeLoggable(() => testCaseStore.listByResult('passed'), log),
        listFailedCases: log =>
            makeLoggable(() => testCaseStore.listByResult('failed'), log),
        listBlockedCases: log =>
            makeLoggable(() => testCaseStore.listByResult('blocked'), log),
        getTestReport: (env, log) =>
            makeLoggable(() => testCaseStore.getReport(env), log),
        getRandomCaseNotRun: () => {
            const testCase = testCaseStore.getRandomNotRun()
            if (!testCase) return console.log('Empty not-run test case list')
            addTestCaseToDom(testCase)
            return testCase.info
        },
        getCaseById(id) {
            const testCase = testCaseStore.getOneById(id)
            if (!testCase) return console.log('not found')
            addTestCaseToDom(testCase)
            return testCase.info
        },
    })
}

main()
