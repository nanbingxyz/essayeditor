import {createRoot, Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {UpdaterProvider, type UpdaterService} from '@/features/updater'
import {tauriDesktopAdapter} from '@/shared/platform/desktop'

import SettingsPage from './settings-page'

const roots: Root[] = []

function renderSettings(disabled = false) {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    roots.push(root)
    const onAppearanceChange = vi.fn()
    const updaterService: UpdaterService = {
        check: vi.fn(async () => null),
        getVersion: vi.fn(() => new Promise<string>(() => undefined)),
        relaunch: vi.fn(async () => undefined),
    }

    act(() =>
        root.render(
            <UpdaterProvider service={updaterService} autoCheck={false}>
                <SettingsPage
                    value=""
                    saveStatus="idle"
                    disabled={disabled}
                    appearance="system"
                    onChange={vi.fn()}
                    onBlur={vi.fn()}
                    onAppearanceChange={onAppearanceChange}
                    onBack={vi.fn()}
                />
            </UpdaterProvider>
        )
    )

    return {container, onAppearanceChange}
}

afterEach(() => {
    vi.restoreAllMocks()
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
})

describe('SettingsPage appearance controls', () => {
    it('renders API Key help with the setup image and settings link', () => {
        const {container} = renderSettings()
        const helpButton = container.querySelector<HTMLButtonElement>(
            'button[aria-label="查看 API Key 获取方式"]'
        )

        expect(helpButton).not.toBeNull()

        act(() => helpButton?.click())

        const helpImage = document.querySelector<HTMLImageElement>(
            'img[src="/apikey_help.jpg"]'
        )
        const settingsButton = Array.from(
            document.querySelectorAll<HTMLButtonElement>('button')
        ).find((button) => button.textContent?.includes('前往 API 设置'))

        expect(helpImage?.alt).toContain('获取 API Key')
        expect(settingsButton).toBeDefined()

        const openExternal = vi
            .spyOn(tauriDesktopAdapter, 'openExternal')
            .mockResolvedValue()

        act(() => settingsButton?.click())
        expect(openExternal).toHaveBeenCalledWith(
            'https://www.essay.ink/i/settings/api'
        )
    })

    it('renders the system option as the selected default and reports changes', () => {
        const {container, onAppearanceChange} = renderSettings()
        const systemOption = container.querySelector<HTMLInputElement>(
            'input[value="system"]'
        )
        const darkOption = container.querySelector<HTMLInputElement>(
            'input[value="dark"]'
        )

        expect(systemOption?.checked).toBe(true)
        expect(darkOption?.checked).toBe(false)

        act(() => darkOption?.click())
        expect(onAppearanceChange).toHaveBeenCalledWith('dark')
    })

    it('disables every appearance option while settings are loading', () => {
        const {container} = renderSettings(true)

        expect(
            Array.from(
                container.querySelectorAll<HTMLInputElement>(
                    'input[name="appearance"]'
                )
            ).every((input) => input.disabled)
        ).toBe(true)
    })
})
