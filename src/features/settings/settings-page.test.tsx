import {createRoot, Root} from 'react-dom/client'
import {act} from 'react-dom/test-utils'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {UpdaterProvider, type UpdaterService} from '@/features/updater'

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
    roots.splice(0).forEach((root) => act(() => root.unmount()))
    document.body.replaceChildren()
})

describe('SettingsPage appearance controls', () => {
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
