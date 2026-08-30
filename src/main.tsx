import React from 'react'
import ReactDOM from 'react-dom/client'

import App from '@/app/App'
import {Toaster} from '@/shared/ui'

import './App.css'

document.documentElement.dataset.platform = navigator.userAgent.includes('Mac')
    ? 'macos'
    : 'windows'

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <App />
        <Toaster />
    </React.StrictMode>
)
