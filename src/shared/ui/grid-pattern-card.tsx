import type {HTMLAttributes} from 'react'

import {cn} from '@/shared/lib/cn'

import './grid-pattern-card.css'

export interface GridPatternCardProps extends HTMLAttributes<HTMLDivElement> {
    patternClassName?: string
    gradientClassName?: string
}

export function GridPatternCard({
    children,
    className,
    patternClassName,
    gradientClassName,
    ...props
}: GridPatternCardProps) {
    return (
        <div className={cn('grid-pattern-card', className)} {...props}>
            <div
                className={cn('grid-pattern-card-pattern', patternClassName)}
            >
                <div
                    className={cn(
                        'grid-pattern-card-gradient',
                        gradientClassName
                    )}
                >
                    {children}
                </div>
            </div>
        </div>
    )
}

export function GridPatternCardBody({
    className,
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn('grid-pattern-card-body', className)}
            {...props}
        />
    )
}
