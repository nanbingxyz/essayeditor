import {useCallback, useEffect, useRef, useState} from 'react'

import {
    createOpenAiCompatibleClient,
    toOpenAiConfig,
    type OpenAiCompatibleClient,
} from '@/features/analysis/openai-client'
import {
    tauriDesktopAdapter,
    type DesktopAdapter,
} from '@/shared/platform/desktop'

import type {
    ApiKeySaveStatus,
    Appearance,
    LlmActionStatus,
    LlmSettings,
} from './model'
import {defaultLlmSettings} from './model'
import type {SettingsRepository} from './settings-repository'

const API_KEY_SAVE_DELAY = 400
const LLM_SAVE_DELAY = 400
const defaultLlmClient = createOpenAiCompatibleClient()

interface SettingsControllerOptions {
    desktop?: DesktopAdapter
    llmClient?: OpenAiCompatibleClient
    onAppearanceSaveError: () => void
    onLoadError: () => void
    repository: SettingsRepository
}

function applyDocumentAppearance(appearance: Appearance) {
    if (appearance === 'system') {
        delete document.documentElement.dataset.theme
    } else {
        document.documentElement.dataset.theme = appearance
    }
}

export function useSettingsController({
    desktop = tauriDesktopAdapter,
    llmClient = defaultLlmClient,
    onAppearanceSaveError,
    onLoadError,
    repository,
}: SettingsControllerOptions) {
    const [accessToken, setAccessToken] = useState('')
    const [apiKeyDraft, setApiKeyDraft] = useState('')
    const [appearance, setAppearance] = useState<Appearance>('system')
    const [saveStatus, setSaveStatus] =
        useState<ApiKeySaveStatus>('idle')
    const [llmSettings, setLlmSettings] = useState<LlmSettings>({
        ...defaultLlmSettings,
    })
    const [llmSaveStatus, setLlmSaveStatus] =
        useState<ApiKeySaveStatus>('idle')
    const [modelStatus, setModelStatus] =
        useState<LlmActionStatus>('idle')
    const [models, setModels] = useState<string[]>([])
    const [modelError, setModelError] = useState('')
    const [testStatus, setTestStatus] =
        useState<LlmActionStatus>('idle')
    const [testError, setTestError] = useState('')
    const [ready, setReady] = useState(false)

    const onAppearanceSaveErrorRef = useRef(onAppearanceSaveError)
    const onLoadErrorRef = useRef(onLoadError)
    const accessTokenRef = useRef('')
    const apiKeyDraftRef = useRef('')
    const queuedAccessTokenRef = useRef('')
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
    const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))
    const saveGenerationRef = useRef(0)
    const llmSettingsRef = useRef(llmSettings)
    const llmSaveTimerRef = useRef<ReturnType<typeof setTimeout>>()
    const llmSaveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))
    const llmSaveGenerationRef = useRef(0)
    const modelRequestRef = useRef<AbortController>()
    const testRequestRef = useRef<AbortController>()

    onAppearanceSaveErrorRef.current = onAppearanceSaveError
    onLoadErrorRef.current = onLoadError
    llmSettingsRef.current = llmSettings

    const applyAppearance = useCallback(
        (nextAppearance: Appearance) => {
            applyDocumentAppearance(nextAppearance)
            void desktop
                .setWindowAppearance(nextAppearance)
                .catch((error) => {
                    console.error('Failed to apply window appearance', error)
                })
        },
        [desktop]
    )

    const enqueueApiKeySave = useCallback(
        (value: string) => {
            const normalizedValue = value.trim()
            const generation = ++saveGenerationRef.current
            queuedAccessTokenRef.current = normalizedValue
            setSaveStatus('saving')

            const saveTask = saveQueueRef.current.then(async () => {
                try {
                    await repository.saveAccessToken(normalizedValue)
                    if (generation === saveGenerationRef.current) {
                        accessTokenRef.current = normalizedValue
                        setAccessToken(normalizedValue)
                        setSaveStatus('saved')
                    }
                    return true
                } catch {
                    if (generation === saveGenerationRef.current) {
                        queuedAccessTokenRef.current = accessTokenRef.current
                        setSaveStatus('error')
                    }
                    return false
                }
            })

            saveQueueRef.current = saveTask
            return saveTask
        },
        [repository]
    )

    const flushApiKeySave = useCallback(async () => {
        if (saveTimerRef.current !== undefined) {
            clearTimeout(saveTimerRef.current)
            saveTimerRef.current = undefined
            return enqueueApiKeySave(apiKeyDraftRef.current)
        }

        if (apiKeyDraftRef.current.trim() !== queuedAccessTokenRef.current) {
            return enqueueApiKeySave(apiKeyDraftRef.current)
        }

        return saveQueueRef.current
    }, [enqueueApiKeySave])

    const scheduleApiKeySave = useCallback(
        (value: string) => {
            apiKeyDraftRef.current = value
            setApiKeyDraft(value)
            setSaveStatus('saving')

            if (saveTimerRef.current !== undefined) {
                clearTimeout(saveTimerRef.current)
            }

            saveTimerRef.current = setTimeout(() => {
                saveTimerRef.current = undefined
                void enqueueApiKeySave(apiKeyDraftRef.current)
            }, API_KEY_SAVE_DELAY)
        },
        [enqueueApiKeySave]
    )

    const enqueueLlmSave = useCallback(
        (settings: LlmSettings) => {
            const normalized: LlmSettings = {
                apiKey: settings.apiKey.trim(),
                baseUrl: settings.baseUrl.trim().replace(/\/+$/, ''),
                model: settings.model.trim(),
                reasoningEnabled: settings.reasoningEnabled,
                verified: settings.verified,
            }
            const generation = ++llmSaveGenerationRef.current
            setLlmSaveStatus('saving')
            const saveTask = llmSaveQueueRef.current.then(async () => {
                try {
                    await repository.saveLlmSettings(normalized)
                    if (generation === llmSaveGenerationRef.current) {
                        setLlmSaveStatus('saved')
                    }
                    return true
                } catch {
                    if (generation === llmSaveGenerationRef.current) {
                        setLlmSaveStatus('error')
                    }
                    return false
                }
            })
            llmSaveQueueRef.current = saveTask
            return saveTask
        },
        [repository]
    )

    const scheduleLlmSave = useCallback(
        (settings: LlmSettings) => {
            if (llmSaveTimerRef.current !== undefined) {
                clearTimeout(llmSaveTimerRef.current)
            }
            setLlmSaveStatus('saving')
            llmSaveTimerRef.current = setTimeout(() => {
                llmSaveTimerRef.current = undefined
                void enqueueLlmSave(settings)
            }, LLM_SAVE_DELAY)
        },
        [enqueueLlmSave]
    )

    const changeLlmSetting = useCallback(
        (field: 'apiKey' | 'baseUrl' | 'model', value: string) => {
            setLlmSettings((current) => {
                const next = {
                    ...current,
                    [field]: value,
                    verified: false,
                }
                llmSettingsRef.current = next
                scheduleLlmSave(next)
                return next
            })
            setTestStatus('idle')
            setTestError('')
            if (field !== 'model') {
                setModels([])
                setModelStatus('idle')
                setModelError('')
            }
        },
        [scheduleLlmSave]
    )

    const changeLlmReasoningEnabled = useCallback(
        (enabled: boolean) => {
            setLlmSettings((current) => {
                const next = {
                    ...current,
                    reasoningEnabled: enabled,
                }
                llmSettingsRef.current = next
                void enqueueLlmSave(next)
                return next
            })
        },
        [enqueueLlmSave]
    )

    const flushLlmSettings = useCallback(async () => {
        if (llmSaveTimerRef.current !== undefined) {
            clearTimeout(llmSaveTimerRef.current)
            llmSaveTimerRef.current = undefined
            return enqueueLlmSave(llmSettingsRef.current)
        }
        return llmSaveQueueRef.current
    }, [enqueueLlmSave])

    const discoverModels = useCallback(async () => {
        const config = llmSettingsRef.current
        if (!config.baseUrl.trim() || !config.apiKey.trim()) {
            setModelStatus('error')
            setModelError('请先填写 Base URL 和 API Key')
            return false
        }
        await flushLlmSettings()

        modelRequestRef.current?.abort()
        const request = new AbortController()
        modelRequestRef.current = request
        setModelStatus('loading')
        setModelError('')
        try {
            const discovered = await llmClient.listModels(
                config,
                request.signal
            )
            if (request.signal.aborted) {
                return false
            }
            setModels(discovered)
            setModelStatus('success')
            if (!discovered.includes(config.model)) {
                const next = {
                    ...config,
                    model: discovered[0],
                    verified: false,
                }
                llmSettingsRef.current = next
                setLlmSettings(next)
                await enqueueLlmSave(next)
            }
            return true
        } catch (error) {
            if (request.signal.aborted) {
                return false
            }
            setModels([])
            setModelStatus('error')
            setModelError(
                error instanceof Error
                    ? error.message
                    : '无法获取模型列表，请手动填写'
            )
            return false
        }
    }, [enqueueLlmSave, flushLlmSettings, llmClient])

    const testLlmConnection = useCallback(async () => {
        const config = llmSettingsRef.current
        if (
            !config.baseUrl.trim() ||
            !config.apiKey.trim() ||
            !config.model.trim()
        ) {
            setTestStatus('error')
            setTestError('请完整填写 Base URL、API Key 和模型名称')
            return false
        }
        const savedBeforeTest = await flushLlmSettings()
        if (!savedBeforeTest) {
            setTestStatus('error')
            setTestError('无法保存大模型配置')
            return false
        }

        testRequestRef.current?.abort()
        const request = new AbortController()
        testRequestRef.current = request
        setTestStatus('loading')
        setTestError('')
        try {
            await llmClient.testConnection(
                toOpenAiConfig(config),
                request.signal
            )
            if (request.signal.aborted) {
                return false
            }
            const verified = {...config, verified: true}
            llmSettingsRef.current = verified
            setLlmSettings(verified)
            const saved = await enqueueLlmSave(verified)
            if (!saved) {
                setTestStatus('error')
                setTestError('连接成功，但无法保存验证状态')
                return false
            }
            setTestStatus('success')
            return true
        } catch (error) {
            if (request.signal.aborted) {
                return false
            }
            const unverified = {...config, verified: false}
            llmSettingsRef.current = unverified
            setLlmSettings(unverified)
            void enqueueLlmSave(unverified)
            setTestStatus('error')
            setTestError(
                error instanceof Error ? error.message : '连接测试失败'
            )
            return false
        }
    }, [enqueueLlmSave, flushLlmSettings, llmClient])

    const changeAppearance = useCallback(
        (nextAppearance: Appearance) => {
            setAppearance(nextAppearance)
            applyAppearance(nextAppearance)
            void repository
                .saveAppearance(nextAppearance)
                .catch(() => onAppearanceSaveErrorRef.current())
        },
        [applyAppearance, repository]
    )

    useEffect(() => {
        let cancelled = false

        void repository
            .load()
            .then((settings) => {
                if (cancelled) {
                    return
                }

                accessTokenRef.current = settings.accessToken
                apiKeyDraftRef.current = settings.accessToken
                queuedAccessTokenRef.current = settings.accessToken
                setAccessToken(settings.accessToken)
                setApiKeyDraft(settings.accessToken)
                setAppearance(settings.appearance)
                llmSettingsRef.current = settings.llm
                setLlmSettings(settings.llm)
                applyAppearance(settings.appearance)
                if (settings.llm.baseUrl && settings.llm.apiKey) {
                    void discoverModels()
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setSaveStatus('error')
                    onLoadErrorRef.current()
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setReady(true)
                }
            })

        return () => {
            cancelled = true
            if (saveTimerRef.current !== undefined) {
                clearTimeout(saveTimerRef.current)
            }
            if (llmSaveTimerRef.current !== undefined) {
                clearTimeout(llmSaveTimerRef.current)
            }
            modelRequestRef.current?.abort()
            testRequestRef.current?.abort()
        }
    }, [applyAppearance, discoverModels, repository])

    const flushAllSettings = useCallback(async () => {
        const [accessTokenSaved, llmSaved] = await Promise.all([
            flushApiKeySave(),
            flushLlmSettings(),
        ])
        return accessTokenSaved && llmSaved
    }, [flushApiKeySave, flushLlmSettings])

    return {
        accessToken,
        apiKeyDraft,
        appearance,
        changeAppearance,
        changeLlmApiKey: (value: string) =>
            changeLlmSetting('apiKey', value),
        changeLlmBaseUrl: (value: string) =>
            changeLlmSetting('baseUrl', value),
        changeLlmModel: (value: string) =>
            changeLlmSetting('model', value),
        changeLlmReasoningEnabled,
        discoverModels,
        flushAllSettings,
        flushApiKeySave,
        flushLlmSettings,
        llmSaveStatus,
        llmSettings,
        modelError,
        models,
        modelStatus,
        ready,
        saveStatus,
        scheduleApiKeySave,
        testError,
        testLlmConnection,
        testStatus,
    }
}
