import { Action, History, Location } from 'history'
import React, { useEffect, useRef, useState } from 'react'
import { Router } from 'react-router'
import { Middleware, Reducer, Store } from 'redux'


// Actions

export type Methods = 'push' | 'replace' | 'go' | 'back' | 'forward'

/**
 * This action type will be dispatched when your history
 * receives a location change.
 */
export const ROUTER_ON_LOCATION_CHANGED = '@@router/ON_LOCATION_CHANGED'

export type LocationChangeAction = {
  type: typeof ROUTER_ON_LOCATION_CHANGED
  payload: {
    location: Location
    action: Action
  }
}

export const onLocationChanged = (location: Location, action: Action): LocationChangeAction => ({
  type: ROUTER_ON_LOCATION_CHANGED,
  payload: { location, action },
})


/**
 * This action type will be dispatched by the history actions below.
 * If you're writing a middleware to watch for navigation events, be sure to
 * look for actions of this type.
 */
export const ROUTER_CALL_HISTORY_METHOD = '@@router/CALL_HISTORY_METHOD'

export type UpdateLocationAction<M extends Methods = Methods> = {
  type: typeof ROUTER_CALL_HISTORY_METHOD
  payload: {
    method: M
    args: Parameters<History[M]>,
  }
}

function updateLocation<M extends Methods = Methods>(method: M) {
  return (...args: Parameters<History[M]>): UpdateLocationAction<M> => ({
    type: ROUTER_CALL_HISTORY_METHOD,
    payload: { method: method, args },
  })
}

/**
 * These actions correspond to the history API.
 * The associated routerMiddleware will capture these events before they get to
 * your reducer and reissue them as the matching function on your history.
 */

/**
 * Pushes a new location onto the history stack, increasing its length by one.
 * If there were any entries in the stack after the current one, they are
 * lost.
 *
 * @param to - The new URL
 * @param state - Data to associate with the new location
 *
 * @see https://github.com/remix-run/history/tree/main/docs/api-reference.md#history.push
 */
export const push = updateLocation('push')

/**
 * Replaces the current location in the history stack with a new one.  The
 * location that was replaced will no longer be available.
 *
 * @param to - The new URL
 * @param state - Data to associate with the new location
 *
 * @see https://github.com/remix-run/history/tree/main/docs/api-reference.md#history.replace
 */
export const replace = updateLocation('replace')

/**
 * Navigates `n` entries backward/forward in the history stack relative to the
 * current index. For example, a "back" navigation would use go(-1).
 *
 * @param delta - The delta in the stack index
 *
 * @see https://github.com/remix-run/history/tree/main/docs/api-reference.md#history.go
 */
export const go = updateLocation('go')

/**
 * Navigates to the next entry in the stack. Identical to go(1).
 *
 * @see https://github.com/remix-run/history/tree/main/docs/api-reference.md#history.forward
 */
export const back = updateLocation('back')

/**
 * Sets up a listener that will be called whenever the current location
 * changes.
 *
 * @param listener - A function that will be called when the location changes
 * @returns unlisten - A function that may be used to stop listening
 *
 * @see https://github.com/remix-run/history/tree/main/docs/api-reference.md#history.listen
 */
export const forward = updateLocation('forward')

export const routerActions = {
  push,
  replace,
  go,
  back,
  forward,
}

export type RouterActions = LocationChangeAction | UpdateLocationAction


// Middleware

export function createRouterMiddleware(history: History): Middleware {
  return () => next => (action: ReturnType<typeof push & typeof replace & typeof go & typeof back & typeof forward>) => {
    if (action.type !== ROUTER_CALL_HISTORY_METHOD) {
      return next(action)
    }
    history[action.payload.method](...action.payload.args)
  }
}


// Reducer

export type ReduxRouterState = {
  location: Location
  action: Action
}

export function createRouterReducer(history: History): Reducer<ReduxRouterState, RouterActions> {
  const initialRouterState: ReduxRouterState = {
    location: history.location,
    action: history.action,
  }

  /*
  * This reducer will update the state with the most recent location history
  * has transitioned to.
  */
  return (state = initialRouterState, action: RouterActions) => {
    if (action.type === ROUTER_ON_LOCATION_CHANGED) {
      return { ...state, ...action.payload }
    }

    return state
  }
}

export type ReduxRouterSelector<T = any> = (state: T) => ReduxRouterState

export type ReduxRouterStoreState = { router: ReduxRouterState }

export function reduxRouterSelector<T extends ReduxRouterStoreState = ReduxRouterStoreState>(state: T): ReduxRouterState {
  return state.router
}


// Component

export type ReduxRouterProps = {
  store: Store
  history: History
  basename?: string
  children: React.ReactNode
  enableTimeTravelling: boolean
  routerSelector: ReduxRouterSelector
}

const development = process.env.NODE_ENV === 'development'

export function ReduxRouter({ enableTimeTravelling = development, routerSelector = reduxRouterSelector, ...props }: ReduxRouterProps) {
  const [ state, setState ] = useState<ReduxRouterState>({
    action: props.history.action,
    location: props.history.location,
  })

  const timeTravellingRef = useRef(false)

  useEffect(
    () => {
      let removeStoreSubscription: () => void | undefined
      let removeHistoryListener: () => void

      if (enableTimeTravelling === true) {
        removeStoreSubscription = props.store.subscribe(() => {
          // Extract store's location and browser location
          const locationInStore = routerSelector(props.store.getState()).location
          const historyLocation = props.history.location

          // If we do time travelling, the location in store is changed but location in history is not changed
          if (
            props.history.action === 'PUSH' &&
            (
              historyLocation.pathname !== locationInStore.pathname ||
              historyLocation.search !== locationInStore.search ||
              historyLocation.hash !== locationInStore.hash ||
              historyLocation.state !== locationInStore.state
            )
          ) {
            timeTravellingRef.current = true
            props.history.push(locationInStore)
          }
        })
      }

      removeHistoryListener = props.history.listen(({ location, action }) => {
        if (timeTravellingRef.current === false) {
          props.store.dispatch(onLocationChanged(location, action))
        } else {
          timeTravellingRef.current = false
        }
        setState({ action, location })
      })

      return function cleanup() {
        removeHistoryListener()
        if (removeStoreSubscription !== undefined) {
          removeStoreSubscription()
        }
      }
    },
    development ? [ enableTimeTravelling, history, routerSelector ] : [],
  )

  return (
    <Router
      navigationType={state.action}
      location={state.location}
      basename={props.basename}
      navigator={props.history}
      children={props.children}
    />
  )
}
