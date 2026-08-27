import React from 'react'
import ReactDOM from 'react-dom/client'

import App from '@/app/App'
import {Updater} from '@/features/updater'
import {Toaster} from '@/shared/ui'

import './App.css'

document.documentElement.dataset.platform = navigator.userAgent.includes('Mac')
    ? 'macos'
    : 'windows'

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <App />
        <Toaster />
        <Updater />
    </React.StrictMode>
)
