// Utils
function mergeObjects(
    baseObj: {[key: string]: any},
    incomingObj: {[key: string]: any},
) {
    Object.keys(incomingObj).forEach(key => {
        if (typeof incomingObj[key] !== 'undefined')
            baseObj[key] = incomingObj[key]
    })
}

function parseVariableName(name: string) {
    return name.toLowerCase().replace('-', '')
}

function makeLoggable(fn: () => string, log = true) {
    return log ? console.log(fn()) : fn()
}

function generateId() {
    return Math.floor(Math.random() * 1e13).toString()
}

function genLookupMap<T extends {id: string; [key: string]: any}>(arr: T[]) {
    const objMap: {[id: string]: T | undefined} = {}
    arr.forEach(item => (objMap[item.id] = item))
    return objMap
}

// Types
type Result = 'passed' | 'failed' | 'blocked' | null

type Notes = string | null

// Interfaces

// - DAO bases
interface ICopy {
    id: string
    [key: string]: any
}

interface ICopyData extends Omit<ICopy, 'id'> {}

interface ICreateCopy extends ICopy {}

interface IUpdateCopy extends Partial<ICopyData> {}

// - Entities
interface IExecution {
    id: string
    env: string
    result: Result
    time: Date
    notes: Notes
}

interface IExecutionMap {
    [env: string]: IExecution
}

interface ITestCase {
    id: string
    executions: IExecutionMap
    executed: boolean
}

interface ISettings {
    predefinedEnvs: string[]
    env: string
}

// - DAO
interface ExecutionCopyDataDto {
    env: string
    result: Result
    timeInMs: number
    notes: Notes
}

interface ExecutionCopyDto extends ExecutionCopyDataDto {
    id: string
}

interface ExecutionIdMapDto {
    [env: string]: string
}

interface TestCaseCopyDataDto {
    executionIds: ExecutionIdMapDto
}

interface TestCaseCopyDto extends TestCaseCopyDataDto {
    id: string
}

interface SettingsCopyDataDto extends Omit<ISettings, 'env'> {
    env: string | null
}

interface SettingsCopyDto extends SettingsCopyDataDto {
    id: string
}

// -- DAO - Transactional
interface CreateExecutionCopyDto extends ExecutionCopyDto {}

interface UpdateExecutionCopyDto extends Partial<ExecutionCopyDataDto> {}

interface CreateTestCaseCopyDto extends TestCaseCopyDto {}

interface UpdateTestCaseCopyDto extends Partial<TestCaseCopyDataDto> {}

interface CreateSettingsCopyDto extends SettingsCopyDto {}

interface UpdateSettingCopyDto extends Partial<SettingsCopyDataDto> {}

// - Stores

interface ExecutionConstructorDto {
    execution: CreateExecutionInstanceDto
    store: ExecutionStore
    // testCase: TestCase
}

interface ExecutionStoreConstructorDto {
    dao: ExecutionDao
    rootStore: RootStore
}

interface ExecutionMap {
    [env: string]: Execution
}

interface TestCaseConstructorDto {
    testCase: CreateTestCaseInstanceDto
    store: TestCaseStore
}

interface TestCaseStoreConstructorDto {
    dao: TestCaseDao
    rootStore: RootStore
}

interface SettingsConstructorDto {
    dao: SettingsDao
    rootStore: RootStore
}

// -- Stores - Transactional

interface CreateExecutionInstanceDto extends IExecution {}

interface UpdateExecutionInstanceDto extends Partial<Omit<IExecution, 'id'>> {}

interface UpdateExecutionMap extends Partial<IExecutionMap> {}

interface CreateTestCaseInstanceDto {
    id: string
    executions: ExecutionMap
}

interface ImportTestCaseInstanceDto {
    id: string
    executionCopies: {
        [env: string]: ExecutionCopyDto
    }
}

interface UpdateSettingsInstanceDto {
    predefinedEnvs?: string[]
    env?: string | null
}

interface RootStoreConstructor {
    executionDao: ExecutionDao
    testCaseDao: TestCaseDao
    settingsDao: SettingsDao
}

// - Main

// interface CreateTestCaseDto

// DAOs
abstract class Dao<
    T extends ICopy,
    CreateT extends ICreateCopy,
    UpdateT extends IUpdateCopy,
> {
    private index: string[] = []

    constructor(private indexPrefix: string) {
        const loadedIndex = this.loadIndex()
        if (!loadedIndex) this.setIndex([])
        else this.index = loadedIndex
    }

    get indexKey() {
        return `${this.indexPrefix}.index`
    }

    loadIndex() {
        const index = localStorage.getItem(this.indexKey)
        return index ? (JSON.parse(index) as string[]) : null
    }

    setIndex(index: string[]) {
        localStorage.setItem(this.indexKey, JSON.stringify(index))
    }

    addToIndex(id: string) {
        this.index.push(id)
        localStorage.setItem(this.indexKey, JSON.stringify(this.index))
    }

    addManyToIndex(ids: string[]) {
        this.index.push(...ids)
        localStorage.setItem(this.indexKey, JSON.stringify(this.index))
    }

    removeFromIndex(id: string) {
        const idIdx = this.index.findIndex(foundId => foundId === id)
        if (idIdx === -1) return

        this.index.splice(idIdx, 1)
        localStorage.setItem(this.indexKey, JSON.stringify(this.index))
    }

    private getIdKey(id: string) {
        return `${this.indexPrefix}.${id}`
    }

    findById(id: string): T | undefined {
        const record = localStorage.getItem(this.getIdKey(id))
        if (record) return {...JSON.parse(record), id}
    }

    findManyById(ids: string[]): T[] {
        const records: T[] = []
        ids.forEach(id => {
            const record = this.findById(id)
            if (record) records.push(record)
        })

        return records
    }

    getAll(): T[] {
        // const trimmedIndex = this.index.slice(0, count)
        // return trimmedIndex
        return this.index
            .map(id => this.findById(id))
            .filter(record => !!record) as T[]
    }

    createOne({id, ...data}: CreateT) {
        localStorage.setItem(this.getIdKey(id), JSON.stringify(data))
        this.addToIndex(id)
    }

    createMany(cases: CreateT[]) {
        cases.forEach(({id, ...data}) =>
            localStorage.setItem(this.getIdKey(id), JSON.stringify(data)),
        )
        this.addManyToIndex(cases.map(({id}) => id))
    }

    updateById(id: string, data: UpdateT) {
        const foundRecord = this.findById(id)
        if (!foundRecord)
            throw new Error(`Could not update ${this.indexPrefix} record`)

        const updatedRecord = {...foundRecord}
        mergeObjects(updatedRecord, data)
        localStorage.setItem(this.getIdKey(id), JSON.stringify(updatedRecord))
    }

    deleteById(id: string) {
        localStorage.removeItem(this.getIdKey(id))
        this.removeFromIndex(id)
    }

    deleteAll() {
        this.index.forEach(id => localStorage.removeItem(this.getIdKey(id)))
        this.index = []
        this.setIndex([])
    }
}

class TestCaseDao extends Dao<
    TestCaseCopyDto,
    CreateTestCaseCopyDto,
    UpdateTestCaseCopyDto
> {
    static INDEX_PREFIX = 'testCase'

    constructor() {
        super(TestCaseDao.INDEX_PREFIX)
    }
}

class ExecutionDao extends Dao<
    ExecutionCopyDto,
    CreateExecutionCopyDto,
    UpdateExecutionCopyDto
> {
    static INDEX_PREFIX = 'execution'

    constructor() {
        super(ExecutionDao.INDEX_PREFIX)
    }
}

class SettingsDao extends Dao<
    SettingsCopyDto,
    CreateSettingsCopyDto,
    UpdateSettingCopyDto
> {
    static INDEX_PREFIX = 'settings'

    constructor() {
        super(SettingsDao.INDEX_PREFIX)
    }
}

// Stores
class Execution implements IExecution {
    id: string = ''
    env: string = ''
    result: Result = null
    time: Date = new Date()
    notes: Notes = null

    store: ExecutionStore
    dao: ExecutionDao

    constructor({execution, store}: ExecutionConstructorDto) {
        mergeObjects(this, execution)
        this.store = store
        this.dao = this.store.dao
    }

    get asCopyData(): ExecutionCopyDataDto {
        return {
            env: this.env,
            result: this.result,
            timeInMs: this.time.getTime(),
            notes: this.notes,
        }
    }

    get asCopy(): ExecutionCopyDto {
        return {...this.asCopyData, id: this.id}
    }

    get info() {
        return (
            `${this.env.toUpperCase()} (${this.result || 'not run'})` +
            (this.notes ? `: ${this.notes}` : '')
        )
    }

    update(data: UpdateExecutionInstanceDto) {
        mergeObjects(this, data)
        this.dao.updateById(this.id, this.asCopyData)
    }

    setNotes(notes: Notes) {
        this.update({notes})
    }

    pass(notes?: Notes, time = new Date()) {
        this.update({notes, time, result: 'passed'})
    }

    fail(notes?: Notes, time = new Date()) {
        this.update({notes, time, result: 'failed'})
    }

    block(notes?: Notes, time = new Date()) {
        this.update({notes, time, result: 'blocked'})
    }

    uncheck() {
        this.update({result: null})
    }
}

class ExecutionStore {
    dao: ExecutionDao
    rootStore: RootStore

    constructor({dao, rootStore}: ExecutionStoreConstructorDto) {
        this.dao = dao
        this.rootStore = rootStore
    }

    get defaultEnv() {
        return this.rootStore.settings.env
    }

    autoCreate({
        result = null,
        time = new Date(),
        notes = null,
    }: UpdateExecutionInstanceDto) {
        return this.create({
            id: generateId(),
            result,
            time,
            notes,
            env: this.defaultEnv,
        })
    }

    create(execution: CreateExecutionInstanceDto) {
        const instance = this.genExecution(execution)
        this.dao.createOne(instance.asCopy)

        return instance
    }

    createMany(executions: CreateExecutionInstanceDto[]) {
        const instances = executions.map(execution =>
            this.genExecution(execution),
        )
        this.dao.createMany(instances.map(({asCopy}) => asCopy))

        console.log(`${instances.length} executions added`)
        return instances
    }

    import(copies: ExecutionCopyDto[]) {
        const instances = copies.map(copy =>
            this.genExecution(parseExecutionFromCopy(copy)),
        )
        this.dao.createMany(copies)

        console.log(`${instances.length} executions added`)
        return instances
    }

    getOneById(id: string): Execution | undefined {
        const copy = this.dao.findById(id)
        if (!copy) return

        return this.genExecution(parseExecutionFromCopy(copy))
    }

    getManyById(ids: string[]): Execution[] {
        return this.dao
            .findManyById(ids)
            .map(copy => this.genExecution(parseExecutionFromCopy(copy)))
    }

    genExecution(execution: CreateExecutionInstanceDto) {
        return new Execution({execution, store: this})
    }
}

function parseExecutionFromCopy({
    timeInMs,
    ...copy
}: ExecutionCopyDto): IExecution {
    return {...copy, time: new Date(timeInMs)}
}

class TestCase implements ITestCase {
    id: string = ''
    executions: ExecutionMap = {}

    store: TestCaseStore
    dao: TestCaseDao

    constructor({testCase, store}: TestCaseConstructorDto) {
        mergeObjects(this, testCase)

        this.store = store
        this.dao = this.store.dao
    }

    get executed() {
        return !!this.executionList.length
    }

    get asCopyData(): TestCaseCopyDataDto {
        const executionIds: ExecutionIdMapDto = {}
        Object.entries(this.executions).forEach(
            ([env, {id}]) => (executionIds[env] = id),
        )

        return {
            executionIds,
        }
    }

    get asCopy(): TestCaseCopyDto {
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

    getExecution(env: string) {
        if (this.executions[env]) return this.executions[env]
    }

    setResult(result: Result, notes?: Notes, time?: Date) {
        const existingExecution = this.getExecution(this.defaultEnv)
        const targetExecution =
            existingExecution ||
            this.executionStore.autoCreate({result, time, notes})

        targetExecution.update({result, notes, time})

        if (existingExecution) return

        this.executions[this.defaultEnv] = targetExecution
        this.dao.updateById(this.id, this.asCopyData)
    }

    pass(notes?: Notes, time?: Date) {
        this.setResult('passed', notes, time)
    }

    fail(notes?: Notes, time?: Date) {
        this.setResult('failed', notes, time)
    }

    block(notes?: Notes, time?: Date) {
        this.setResult('blocked', notes, time)
    }

    uncheck() {
        this.setResult(null, null)
    }
}

class TestCaseStore {
    testCases: TestCase[] = []

    dao: TestCaseDao
    rootStore: RootStore

    constructor({dao, rootStore}: TestCaseStoreConstructorDto) {
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
            const executions: ExecutionMap = {}
            Object.entries(executionIds).forEach(([env, id]) => {
                const execution = allExecutionsMap[id]
                if (execution) executions[env] = execution
            })

            return this.genTestCase({id, executions})
        })
    }

    create(testCase: CreateTestCaseInstanceDto) {
        const instance = this.genTestCase(testCase)
        this.testCases.push(instance)
        this.dao.createOne(instance.asCopy)
        return instance
    }

    createMany(testCases: CreateTestCaseInstanceDto[]) {
        const instances = testCases.map(testCase => this.genTestCase(testCase))
        this.testCases.push(...instances)
        this.dao.createMany(instances.map(({asCopy}) => asCopy))

        console.log(`${instances.length} test cases added`)
        return instances
    }

    import(copies: ImportTestCaseInstanceDto[]) {
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
            const executions: ExecutionMap = {}
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

    genTestCase(testCase: CreateTestCaseInstanceDto) {
        return new TestCase({testCase, store: this})
    }

    getAllByResult(result: Result, env?: string) {
        if (result)
            return this.getAllExecuted().filter(
                ({executions}) =>
                    !!Object.entries(executions).find(
                        ([key, execution]: [string, Execution | null]) =>
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

    getOneById(id: string) {
        return this.testCases.find(({id: foundId}) => foundId === id)
    }

    getReport(env: string) {
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

    list(limit?: number) {
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

    listByResult(result: Result) {
        return this.makeList(this.getAllByResult(result))
    }

    makeList(testCases: TestCase[]) {
        return testCases.map(testCase => `- ${testCase.info}`).join('\n')
    }

    deleteAll() {
        this.testCases = []
        this.dao.deleteAll()
    }
}

class Settings implements ISettings {
    _id: string | null = null
    predefinedEnvs: string[] = []
    _env: string | null = null

    dao: SettingsDao
    rootStore: RootStore

    constructor({dao, rootStore}: SettingsConstructorDto) {
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

    get asCopyData(): SettingsCopyDataDto {
        return {
            predefinedEnvs: this.predefinedEnvs,
            env: this._env,
        }
    }

    update({predefinedEnvs, env}: UpdateSettingsInstanceDto) {
        if (predefinedEnvs) this.predefinedEnvs = predefinedEnvs
        if (typeof env !== 'undefined') this._env = env

        if (this._id) this.dao.updateById(this._id, this.asCopyData)
    }

    setEnv(env: string) {
        this.update({env})
    }

    setPredefinedEnvs(predefinedEnvs: string[]) {
        this.update({predefinedEnvs})
    }
}

class RootStore {
    executionStore: ExecutionStore
    testCaseStore: TestCaseStore
    settings: Settings

    constructor({
        executionDao,
        testCaseDao,
        settingsDao,
    }: RootStoreConstructor) {
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

const genTestCaseMap = (testCase: TestCase) => {
    const map: {[key: string]: TestCase} = {}
    map[testCase.variableName] = testCase
    return map
}

const addTestCaseToDom = (testCase: TestCase) => {
    const map = genTestCaseMap(testCase)
    mergeObjects(window, map)
}

mergeObjects(window, {
    setAvailableEnvironments: (envs: string[]) =>
        settings.setPredefinedEnvs(envs),
    setEnvironment: (env: string) => settings.setEnv(env),
    createCase: (id: string) => {
        const testCase = testCaseStore.create({id, executions: {}})
        addTestCaseToDom(testCase)
        return testCase.info
    },
    createCases: (ids: string[], addToDom = false) => {
        const testCases = testCaseStore.createMany(
            ids.map(id => ({id, executions: {}})),
        )
        if (addToDom) testCases.forEach(testCase => addTestCaseToDom(testCase))
    },
    importCases: (testCases: ImportTestCaseInstanceDto[]) =>
        testCaseStore.import(testCases),
    getCases: () => testCaseStore.testCases,
    listCases: (log?: boolean, count?: number) =>
        makeLoggable(() => testCaseStore.list(count), log),
    listCasesDone: (log?: boolean) =>
        makeLoggable(() => testCaseStore.listExecuted(), log),
    listCasesNotRun: (log?: boolean) =>
        makeLoggable(() => testCaseStore.listNotRun(), log),
    listPassedCases: (log?: boolean) =>
        makeLoggable(() => testCaseStore.listByResult('passed'), log),
    listFailedCases: (log?: boolean) =>
        makeLoggable(() => testCaseStore.listByResult('failed'), log),
    listBlockedCases: (log?: boolean) =>
        makeLoggable(() => testCaseStore.listByResult('blocked'), log),
    getTestReport: (env: string, log?: boolean) =>
        makeLoggable(() => testCaseStore.getReport(env), log),
    getRandomCaseNotRun: () => {
        const testCase = testCaseStore.getRandomNotRun()
        if (!testCase) return console.log('Empty not-run test case list')
        addTestCaseToDom(testCase)
        return testCase.info
    },
    getCaseById(id: string) {
        const testCase = testCaseStore.getOneById(id)
        if (!testCase) return console.log('not found')
        addTestCaseToDom(testCase)
        return testCase.info
    },
})
