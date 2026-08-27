import {useCallback, useEffect, useRef, useState} from 'react'

import {
    tauriDesktopAdapter,
    type DesktopAdapter,
} from '@/shared/platform/desktop'

import type {ApiKeySaveStatus, Appearance} from './model'
import type {SettingsRepository} from './settings-repository'

const API_KEY_SAVE_DELAY = 400

interface SettingsControllerOptions {
    desktop?: DesktopAdapter
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
    onAppearanceSaveError,
    onLoadError,
    repository,
}: SettingsControllerOptions) {
    const [accessToken, setAccessToken] = useState('')
    const [apiKeyDraft, setApiKeyDraft] = useState('')
    const [appearance, setAppearance] = useState<Appearance>('system')
    const [saveStatus, setSaveStatus] =
        useState<ApiKeySaveStatus>('idle')
    const [ready, setReady] = useState(false)

    const onAppearanceSaveErrorRef = useRef(onAppearanceSaveError)
    const onLoadErrorRef = useRef(onLoadError)
    const accessTokenRef = useRef('')
    const apiKeyDraftRef = useRef('')
    const queuedAccessTokenRef = useRef('')
    const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
    const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true))
    const saveGenerationRef = useRef(0)

    onAppearanceSaveErrorRef.current = onAppearanceSaveError
    onLoadErrorRef.current = onLoadError

    const applyAppearance = useCallback(
        (nextAppearance: Appearance) => {
            applyDocumentAppearance(nextAppearance)
            void desktop
                .setWindowAppearance(nextAppearance)
                .catch(() => undefined)
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
                applyAppearance(settings.appearance)
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
        }
    }, [applyAppearance, repository])

    return {
        accessToken,
        apiKeyDraft,
        appearance,
        changeAppearance,
        flushApiKeySave,
        ready,
        saveStatus,
        scheduleApiKeySave,
    }
}
