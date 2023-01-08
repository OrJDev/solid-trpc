import { createComponent, isServer as isServer$1, mergeProps as mergeProps$1 } from 'solid-js/web';
import { createContext, $PROXY, $TRACK, getListener, batch, createSignal, mergeProps, onMount, onCleanup, createMemo, createComputed, on, useContext, createResource, createEffect } from 'solid-js';

function identity(x) {
    return x;
}

/** @internal */ function pipeFromArray(fns) {
    if (fns.length === 0) {
        return identity;
    }
    if (fns.length === 1) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return fns[0];
    }
    return function piped(input) {
        return fns.reduce((prev, fn)=>fn(prev), input);
    };
}
function observable(subscribe) {
    const self = {
        subscribe (observer) {
            let teardownRef = null;
            let isDone = false;
            let unsubscribed = false;
            let teardownImmediately = false;
            function unsubscribe() {
                if (teardownRef === null) {
                    teardownImmediately = true;
                    return;
                }
                if (unsubscribed) {
                    return;
                }
                unsubscribed = true;
                if (typeof teardownRef === 'function') {
                    teardownRef();
                } else if (teardownRef) {
                    teardownRef.unsubscribe();
                }
            }
            teardownRef = subscribe({
                next (value) {
                    if (isDone) {
                        return;
                    }
                    observer.next?.(value);
                },
                error (err) {
                    if (isDone) {
                        return;
                    }
                    isDone = true;
                    observer.error?.(err);
                    unsubscribe();
                },
                complete () {
                    if (isDone) {
                        return;
                    }
                    isDone = true;
                    observer.complete?.();
                    unsubscribe();
                }
            });
            if (teardownImmediately) {
                unsubscribe();
            }
            return {
                unsubscribe
            };
        },
        pipe (...operations) {
            return pipeFromArray(operations)(self);
        }
    };
    return self;
}

function share(// eslint-disable-next-line @typescript-eslint/no-unused-vars
_opts) {
    return (originalObserver)=>{
        let refCount = 0;
        let subscription = null;
        const observers = [];
        function startIfNeeded() {
            if (subscription) {
                return;
            }
            subscription = originalObserver.subscribe({
                next (value) {
                    for (const observer of observers){
                        observer.next?.(value);
                    }
                },
                error (error) {
                    for (const observer of observers){
                        observer.error?.(error);
                    }
                },
                complete () {
                    for (const observer of observers){
                        observer.complete?.();
                    }
                }
            });
        }
        function resetIfNeeded() {
            // "resetOnRefCountZero"
            if (refCount === 0 && subscription) {
                const _sub = subscription;
                subscription = null;
                _sub.unsubscribe();
            }
        }
        return {
            subscribe (observer) {
                refCount++;
                observers.push(observer);
                startIfNeeded();
                return {
                    unsubscribe () {
                        refCount--;
                        resetIfNeeded();
                        const index = observers.findIndex((v)=>v === observer);
                        if (index > -1) {
                            observers.splice(index, 1);
                        }
                    }
                };
            }
        };
    };
}

function tap(observer) {
    return (originalObserver)=>{
        return {
            subscribe (observer2) {
                return originalObserver.subscribe({
                    next (v) {
                        observer.next?.(v);
                        observer2.next?.(v);
                    },
                    error (v) {
                        observer.error?.(v);
                        observer2.error?.(v);
                    },
                    complete () {
                        observer.complete?.();
                        observer2.complete?.();
                    }
                });
            }
        };
    };
}

class ObservableAbortError extends Error {
    constructor(message){
        super(message);
        this.name = 'ObservableAbortError';
        Object.setPrototypeOf(this, ObservableAbortError.prototype);
    }
}
/** @internal */ function observableToPromise(observable) {
    let abort;
    const promise = new Promise((resolve, reject)=>{
        let isDone = false;
        function onDone() {
            if (isDone) {
                return;
            }
            isDone = true;
            reject(new ObservableAbortError('This operation was aborted.'));
            obs$.unsubscribe();
        }
        const obs$ = observable.subscribe({
            next (data) {
                isDone = true;
                resolve(data);
                onDone();
            },
            error (data) {
                isDone = true;
                reject(data);
                onDone();
            },
            complete () {
                isDone = true;
                onDone();
            }
        });
        abort = onDone;
    });
    return {
        promise,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        abort: abort
    };
}

class TRPCClientError extends Error {
    static from(cause, opts = {}) {
        if (!(cause instanceof Error)) {
            return new TRPCClientError(cause.error.message ?? '', {
                ...opts,
                cause: undefined,
                result: cause
            });
        }
        if (cause.name === 'TRPCClientError') {
            return cause;
        }
        return new TRPCClientError(cause.message, {
            ...opts,
            cause,
            result: null
        });
    }
    constructor(message, opts){
        const cause = opts?.cause;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore https://github.com/tc39/proposal-error-cause
        super(message, {
            cause
        });
        this.meta = opts?.meta;
        this.cause = cause;
        this.shape = opts?.result?.error;
        this.data = opts?.result?.error.data;
        this.name = 'TRPCClientError';
        Object.setPrototypeOf(this, TRPCClientError.prototype);
    }
}

// FIXME:
// - the generics here are probably unnecessary
// - the RPC-spec could probably be simplified to combine HTTP + WS
/** @internal */ function transformResult(response, runtime) {
    if ('error' in response) {
        const error = runtime.transformer.deserialize(response.error);
        return {
            ok: false,
            error: {
                ...response,
                error
            }
        };
    }
    const result = {
        ...response.result,
        ...(!response.result.type || response.result.type === 'data') && {
            type: 'data',
            data: runtime.transformer.deserialize(response.result.data)
        }
    };
    return {
        ok: true,
        result
    };
}

/** @internal */ function createChain(opts) {
    return observable((observer)=>{
        function execute(index = 0, op = opts.op) {
            const next = opts.links[index];
            if (!next) {
                throw new Error('No more links to execute - did you forget to add an ending link?');
            }
            const subscription = next({
                op,
                next (nextOp) {
                    const nextObserver = execute(index + 1, nextOp);
                    return nextObserver;
                }
            });
            return subscription;
        }
        const obs$ = execute();
        return obs$.subscribe(observer);
    });
}

function asArray(value) {
    return Array.isArray(value) ? value : [
        value
    ];
}
function splitLink(opts) {
    return (runtime)=>{
        const yes = asArray(opts.true).map((link)=>link(runtime));
        const no = asArray(opts.false).map((link)=>link(runtime));
        return (props)=>{
            return observable((observer)=>{
                const links = opts.condition(props.op) ? yes : no;
                return createChain({
                    op: props.op,
                    links
                }).subscribe(observer);
            });
        };
    };
}

function getWindow() {
    if (typeof window !== 'undefined') {
        return window;
    }
    return globalThis;
}
function getAbortController(ac) {
    return ac ?? getWindow().AbortController ?? null;
}

function getFetch(f) {
    if (f) {
        return f;
    }
    const win = getWindow();
    const globalFetch = win.fetch;
    if (globalFetch) {
        return typeof globalFetch.bind === 'function' ? globalFetch.bind(win) : globalFetch;
    }
    throw new Error('No fetch implementation found');
}

function resolveHTTPLinkOptions(opts) {
    const headers = opts.headers || (()=>({}));
    return {
        url: opts.url,
        fetch: getFetch(opts.fetch),
        AbortController: getAbortController(opts.AbortController),
        headers: typeof headers === 'function' ? headers : ()=>headers
    };
}
// https://github.com/trpc/trpc/pull/669
function arrayToDict(array) {
    const dict = {};
    for(let index = 0; index < array.length; index++){
        const element = array[index];
        dict[index] = element;
    }
    return dict;
}
const METHOD = {
    query: 'GET',
    mutation: 'POST'
};
function getInput(opts) {
    return 'input' in opts ? opts.runtime.transformer.serialize(opts.input) : arrayToDict(opts.inputs.map((_input)=>opts.runtime.transformer.serialize(_input)));
}
function getUrl(opts) {
    let url = opts.url + '/' + opts.path;
    const queryParts = [];
    if ('inputs' in opts) {
        queryParts.push('batch=1');
    }
    if (opts.type === 'query') {
        const input = getInput(opts);
        if (input !== undefined) {
            queryParts.push(`input=${encodeURIComponent(JSON.stringify(input))}`);
        }
    }
    if (queryParts.length) {
        url += '?' + queryParts.join('&');
    }
    return url;
}
function getBody(opts) {
    if (opts.type === 'query') {
        return undefined;
    }
    const input = getInput(opts);
    return input !== undefined ? JSON.stringify(input) : undefined;
}
function httpRequest(opts) {
    const { type  } = opts;
    const ac = opts.AbortController ? new opts.AbortController() : null;
    const promise = new Promise((resolve, reject)=>{
        const url = getUrl(opts);
        const body = getBody(opts);
        const meta = {};
        Promise.resolve(opts.headers()).then((headers)=>{
            if (type === 'subscription') {
                throw new Error('Subscriptions should use wsLink');
            }
            return opts.fetch(url, {
                method: METHOD[type],
                signal: ac?.signal,
                body: body,
                headers: {
                    'content-type': 'application/json',
                    ...headers
                }
            });
        }).then((_res)=>{
            meta.response = _res;
            return _res.json();
        }).then((json)=>{
            resolve({
                json,
                meta
            });
        }).catch(reject);
    });
    const cancel = ()=>{
        ac?.abort();
    };
    return {
        promise,
        cancel
    };
}

/* eslint-disable @typescript-eslint/no-non-null-assertion */ /**
 * A function that should never be called unless we messed something up.
 */ const throwFatalError = ()=>{
    throw new Error('Something went wrong. Please submit an issue at https://github.com/trpc/trpc/issues/new');
};
/**
 * Dataloader that's very inspired by https://github.com/graphql/dataloader
 * Less configuration, no caching, and allows you to cancel requests
 * When cancelling a single fetch the whole batch will be cancelled only when _all_ items are cancelled
 */ function dataLoader(batchLoader) {
    let pendingItems = null;
    let dispatchTimer = null;
    const destroyTimerAndPendingItems = ()=>{
        clearTimeout(dispatchTimer);
        dispatchTimer = null;
        pendingItems = null;
    };
    /**
   * Iterate through the items and split them into groups based on the `batchLoader`'s validate function
   */ function groupItems(items) {
        const groupedItems = [
            []
        ];
        let index = 0;
        while(true){
            const item = items[index];
            if (!item) {
                break;
            }
            const lastGroup = groupedItems[groupedItems.length - 1];
            if (item.aborted) {
                // Item was aborted before it was dispatched
                item.reject(new Error('Aborted'));
                index++;
                continue;
            }
            const isValid = batchLoader.validate(lastGroup.concat(item).map((it)=>it.key));
            if (isValid) {
                lastGroup.push(item);
                index++;
                continue;
            }
            if (lastGroup.length === 0) {
                item.reject(new Error('Input is too big for a single dispatch'));
                index++;
                continue;
            }
            // Create new group, next iteration will try to add the item to that
            groupedItems.push([]);
        }
        return groupedItems;
    }
    function dispatch() {
        const groupedItems = groupItems(pendingItems);
        destroyTimerAndPendingItems();
        // Create batches for each group of items
        for (const items of groupedItems){
            if (!items.length) {
                continue;
            }
            const batch = {
                items,
                cancel: throwFatalError
            };
            for (const item of items){
                item.batch = batch;
            }
            const { promise , cancel  } = batchLoader.fetch(batch.items.map((_item)=>_item.key));
            batch.cancel = cancel;
            promise.then((result)=>{
                for(let i = 0; i < result.length; i++){
                    const value = result[i];
                    const item = batch.items[i];
                    item.resolve(value);
                    item.batch = null;
                }
            }).catch((cause)=>{
                for (const item of batch.items){
                    item.reject(cause);
                    item.batch = null;
                }
            });
        }
    }
    function load(key) {
        const item = {
            aborted: false,
            key,
            batch: null,
            resolve: throwFatalError,
            reject: throwFatalError
        };
        const promise = new Promise((resolve, reject)=>{
            item.reject = reject;
            item.resolve = resolve;
            if (!pendingItems) {
                pendingItems = [];
            }
            pendingItems.push(item);
        });
        if (!dispatchTimer) {
            dispatchTimer = setTimeout(dispatch);
        }
        const cancel = ()=>{
            item.aborted = true;
            if (item.batch?.items.every((item)=>item.aborted)) {
                // All items in the batch have been cancelled
                item.batch.cancel();
                item.batch = null;
            }
        };
        return {
            promise,
            cancel
        };
    }
    return {
        load
    };
}

function httpBatchLink(opts) {
    const resolvedOpts = resolveHTTPLinkOptions(opts);
    // initialized config
    return (runtime)=>{
        const maxURLLength = opts.maxURLLength || Infinity;
        const batchLoader = (type)=>{
            const validate = (batchOps)=>{
                if (maxURLLength === Infinity) {
                    // escape hatch for quick calcs
                    return true;
                }
                const path = batchOps.map((op)=>op.path).join(',');
                const inputs = batchOps.map((op)=>op.input);
                const url = getUrl({
                    ...resolvedOpts,
                    runtime,
                    type,
                    path,
                    inputs
                });
                return url.length <= maxURLLength;
            };
            const fetch = (batchOps)=>{
                const path = batchOps.map((op)=>op.path).join(',');
                const inputs = batchOps.map((op)=>op.input);
                const { promise , cancel  } = httpRequest({
                    ...resolvedOpts,
                    runtime,
                    type,
                    path,
                    inputs
                });
                return {
                    promise: promise.then((res)=>{
                        const resJSON = Array.isArray(res.json) ? res.json : batchOps.map(()=>res.json);
                        const result = resJSON.map((item)=>({
                                meta: res.meta,
                                json: item
                            }));
                        return result;
                    }),
                    cancel
                };
            };
            return {
                validate,
                fetch
            };
        };
        const query = dataLoader(batchLoader('query'));
        const mutation = dataLoader(batchLoader('mutation'));
        const subscription = dataLoader(batchLoader('subscription'));
        const loaders = {
            query,
            subscription,
            mutation
        };
        return ({ op  })=>{
            return observable((observer)=>{
                const loader = loaders[op.type];
                const { promise , cancel  } = loader.load(op);
                promise.then((res)=>{
                    const transformed = transformResult(res.json, runtime);
                    if (!transformed.ok) {
                        observer.error(TRPCClientError.from(transformed.error, {
                            meta: res.meta
                        }));
                        return;
                    }
                    observer.next({
                        context: res.meta,
                        result: transformed.result
                    });
                    observer.complete();
                }).catch((err)=>observer.error(TRPCClientError.from(err)));
                return ()=>{
                    cancel();
                };
            });
        };
    };
}

const noop$2 = ()=>{
// noop
};
function createInnerProxy(callback, path) {
    const proxy = new Proxy(noop$2, {
        get (_obj, key) {
            if (typeof key !== 'string' || key === 'then') {
                // special case for if the proxy is accidentally treated
                // like a PromiseLike (like in `Promise.resolve(proxy)`)
                return undefined;
            }
            return createInnerProxy(callback, [
                ...path,
                key
            ]);
        },
        apply (_1, _2, args) {
            return callback({
                args,
                path
            });
        }
    });
    return proxy;
}
/**
 * Creates a proxy that calls the callback with the path and arguments
 *
 * @internal
 */ const createRecursiveProxy = (callback)=>createInnerProxy(callback, []);
/**
 * Used in place of `new Proxy` where each handler will map 1 level deep to another value.
 *
 * @internal
 */ const createFlatProxy = (callback)=>{
    return new Proxy(noop$2, {
        get (_obj, name) {
            if (typeof name !== 'string' || name === 'then') {
                // special case for if the proxy is accidentally treated
                // like a PromiseLike (like in `Promise.resolve(proxy)`)
                return undefined;
            }
            return callback(name);
        }
    });
};

function httpLink(opts) {
    const resolvedOpts = resolveHTTPLinkOptions(opts);
    return (runtime)=>({ op  })=>observable((observer)=>{
                const { path , input , type  } = op;
                const { promise , cancel  } = httpRequest({
                    ...resolvedOpts,
                    runtime,
                    type,
                    path,
                    input
                });
                promise.then((res)=>{
                    const transformed = transformResult(res.json, runtime);
                    if (!transformed.ok) {
                        observer.error(TRPCClientError.from(transformed.error, {
                            meta: res.meta
                        }));
                        return;
                    }
                    observer.next({
                        context: res.meta,
                        result: transformed.result
                    });
                    observer.complete();
                }).catch((cause)=>observer.error(TRPCClientError.from(cause)));
                return ()=>{
                    cancel();
                };
            });
}

const palette = {
    query: [
        '72e3ff',
        '3fb0d8'
    ],
    mutation: [
        'c5a3fc',
        '904dfc'
    ],
    subscription: [
        'ff49e1',
        'd83fbe'
    ]
};
// maybe this should be moved to it's own package
const defaultLogger$1 = (c = console)=>(props)=>{
        const { direction , input , type , path , context , id  } = props;
        const [light, dark] = palette[type];
        const css = `
    background-color: #${direction === 'up' ? light : dark}; 
    color: ${direction === 'up' ? 'black' : 'white'};
    padding: 2px;
  `;
        const parts = [
            '%c',
            direction === 'up' ? '>>' : '<<',
            type,
            `#${id}`,
            `%c${path}%c`,
            '%O'
        ];
        const args = [
            css,
            `${css}; font-weight: bold;`,
            `${css}; font-weight: normal;`
        ];
        if (props.direction === 'up') {
            args.push({
                input,
                context: context
            });
        } else {
            args.push({
                input,
                result: props.result,
                elapsedMs: props.elapsedMs,
                context
            });
        }
        const fn = props.direction === 'down' && props.result && (props.result instanceof Error || 'error' in props.result.result) ? 'error' : 'log';
        c[fn].apply(null, [
            parts.join(' ')
        ].concat(args));
    };
function loggerLink(opts = {}) {
    const { enabled =()=>true  } = opts;
    const { logger =defaultLogger$1(opts.console)  } = opts;
    return ()=>{
        return ({ op , next  })=>{
            return observable((observer)=>{
                // ->
                enabled({
                    ...op,
                    direction: 'up'
                }) && logger({
                    ...op,
                    direction: 'up'
                });
                const requestStartTime = Date.now();
                function logResult(result) {
                    const elapsedMs = Date.now() - requestStartTime;
                    enabled({
                        ...op,
                        direction: 'down',
                        result
                    }) && logger({
                        ...op,
                        direction: 'down',
                        elapsedMs,
                        result
                    });
                }
                return next(op).pipe(tap({
                    next (result) {
                        logResult(result);
                    },
                    error (result) {
                        logResult(result);
                    }
                })).subscribe(observer);
            });
        };
    };
}

/* istanbul ignore next */ const retryDelay = (attemptIndex)=>attemptIndex === 0 ? 0 : Math.min(1000 * 2 ** attemptIndex, 30000);

function createWSClient(opts) {
    const { url , WebSocket: WebSocketImpl = WebSocket , retryDelayMs: retryDelayFn = retryDelay , onOpen , onClose ,  } = opts;
    /* istanbul ignore next */ if (!WebSocketImpl) {
        throw new Error("No WebSocket implementation found - you probably don't want to use this on the server, but if you do you need to pass a `WebSocket`-ponyfill");
    }
    /**
   * outgoing messages buffer whilst not open
   */ let outgoing = [];
    const pendingRequests = Object.create(null);
    let connectAttempt = 0;
    let dispatchTimer = null;
    let connectTimer = null;
    let activeConnection = createWS();
    let state = 'connecting';
    /**
   * tries to send the list of messages
   */ function dispatch() {
        if (state !== 'open' || dispatchTimer) {
            return;
        }
        dispatchTimer = setTimeout(()=>{
            dispatchTimer = null;
            if (outgoing.length === 1) {
                // single send
                activeConnection.send(JSON.stringify(outgoing.pop()));
            } else {
                // batch send
                activeConnection.send(JSON.stringify(outgoing));
            }
            // clear
            outgoing = [];
        });
    }
    function tryReconnect() {
        if (connectTimer || state === 'closed') {
            return;
        }
        const timeout = retryDelayFn(connectAttempt++);
        reconnectInMs(timeout);
    }
    function reconnect() {
        state = 'connecting';
        const oldConnection = activeConnection;
        activeConnection = createWS();
        closeIfNoPending(oldConnection);
    }
    function reconnectInMs(ms) {
        if (connectTimer) {
            return;
        }
        state = 'connecting';
        connectTimer = setTimeout(reconnect, ms);
    }
    function closeIfNoPending(conn) {
        // disconnect as soon as there are are no pending result
        const hasPendingRequests = Object.values(pendingRequests).some((p)=>p.ws === conn);
        if (!hasPendingRequests) {
            conn.close();
        }
    }
    function resumeSubscriptionOnReconnect(req) {
        if (outgoing.some((r)=>r.id === req.op.id)) {
            return;
        }
        request(req.op, req.callbacks);
    }
    function createWS() {
        const conn = new WebSocketImpl(url);
        clearTimeout(connectTimer);
        connectTimer = null;
        conn.addEventListener('open', ()=>{
            /* istanbul ignore next */ if (conn !== activeConnection) {
                return;
            }
            connectAttempt = 0;
            state = 'open';
            onOpen?.();
            dispatch();
        });
        conn.addEventListener('error', ()=>{
            if (conn === activeConnection) {
                tryReconnect();
            }
        });
        const handleIncomingRequest = (req)=>{
            if (req.method === 'reconnect' && conn === activeConnection) {
                if (state === 'open') {
                    onClose?.();
                }
                reconnect();
                // notify subscribers
                for (const pendingReq of Object.values(pendingRequests)){
                    if (pendingReq.type === 'subscription') {
                        resumeSubscriptionOnReconnect(pendingReq);
                    }
                }
            }
        };
        const handleIncomingResponse = (data)=>{
            const req = data.id !== null && pendingRequests[data.id];
            if (!req) {
                // do something?
                return;
            }
            req.callbacks.next?.(data);
            if (req.ws !== activeConnection && conn === activeConnection) {
                const oldWs = req.ws;
                // gracefully replace old connection with this
                req.ws = activeConnection;
                closeIfNoPending(oldWs);
            }
            if ('result' in data && data.result.type === 'stopped' && conn === activeConnection) {
                req.callbacks.complete();
            }
        };
        conn.addEventListener('message', ({ data  })=>{
            const msg = JSON.parse(data);
            if ('method' in msg) {
                handleIncomingRequest(msg);
            } else {
                handleIncomingResponse(msg);
            }
            if (conn !== activeConnection || state === 'closed') {
                // when receiving a message, we close old connection that has no pending requests
                closeIfNoPending(conn);
            }
        });
        conn.addEventListener('close', ({ code  })=>{
            if (state === 'open') {
                onClose?.({
                    code
                });
            }
            if (activeConnection === conn) {
                // connection might have been replaced already
                tryReconnect();
            }
            for (const [key, req] of Object.entries(pendingRequests)){
                if (req.ws !== conn) {
                    continue;
                }
                req.callbacks.error?.(TRPCClientError.from(new TRPCWebSocketClosedError('WebSocket closed prematurely')));
                if (req.type !== 'subscription') {
                    delete pendingRequests[key];
                    req.callbacks.complete?.();
                } else if (state !== 'closed') {
                    // request restart of sub with next connection
                    resumeSubscriptionOnReconnect(req);
                }
            }
        });
        return conn;
    }
    function request(op, callbacks) {
        const { type , input , path , id  } = op;
        const envelope = {
            id,
            method: type,
            params: {
                input,
                path
            }
        };
        pendingRequests[id] = {
            ws: activeConnection,
            type,
            callbacks,
            op
        };
        // enqueue message
        outgoing.push(envelope);
        dispatch();
        return ()=>{
            const callbacks = pendingRequests[id]?.callbacks;
            delete pendingRequests[id];
            outgoing = outgoing.filter((msg)=>msg.id !== id);
            callbacks?.complete?.();
            if (op.type === 'subscription') {
                outgoing.push({
                    id,
                    method: 'subscription.stop'
                });
                dispatch();
            }
        };
    }
    return {
        close: ()=>{
            state = 'closed';
            onClose?.();
            closeIfNoPending(activeConnection);
            clearTimeout(connectTimer);
            connectTimer = null;
        },
        request,
        getConnection () {
            return activeConnection;
        }
    };
}
class TRPCWebSocketClosedError extends Error {
    constructor(message){
        super(message);
        this.name = 'TRPCWebSocketClosedError';
        Object.setPrototypeOf(this, TRPCWebSocketClosedError.prototype);
    }
}
class TRPCSubscriptionEndedError extends Error {
    constructor(message){
        super(message);
        this.name = 'TRPCSubscriptionEndedError';
        Object.setPrototypeOf(this, TRPCSubscriptionEndedError.prototype);
    }
}
function wsLink(opts) {
    return (runtime)=>{
        const { client  } = opts;
        return ({ op  })=>{
            return observable((observer)=>{
                const { type , path , id , context  } = op;
                const input = runtime.transformer.serialize(op.input);
                let isDone = false;
                const unsub = client.request({
                    type,
                    path,
                    input,
                    id,
                    context
                }, {
                    error (err) {
                        isDone = true;
                        observer.error(err);
                        unsub();
                    },
                    complete () {
                        if (!isDone) {
                            isDone = true;
                            observer.error(TRPCClientError.from(new TRPCSubscriptionEndedError('Operation ended prematurely')));
                        } else {
                            observer.complete();
                        }
                    },
                    next (message) {
                        const transformed = transformResult(message, runtime);
                        if (!transformed.ok) {
                            observer.error(TRPCClientError.from(transformed.error));
                            return;
                        }
                        observer.next({
                            result: transformed.result
                        });
                        if (op.type !== 'subscription') {
                            // if it isn't a subscription we don't care about next response
                            isDone = true;
                            unsub();
                            observer.complete();
                        }
                    }
                });
                return ()=>{
                    isDone = true;
                    unsub();
                };
            });
        };
    };
}

class TRPCClient {
    $request({ type , input , path , context ={}  }) {
        const chain$ = createChain({
            links: this.links,
            op: {
                id: ++this.requestId,
                type,
                path,
                input,
                context
            }
        });
        return chain$.pipe(share());
    }
    requestAsPromise(opts) {
        const req$ = this.$request(opts);
        const { promise , abort  } = observableToPromise(req$);
        const abortablePromise = new Promise((resolve, reject)=>{
            opts.signal?.addEventListener('abort', abort);
            promise.then((envelope)=>{
                resolve(envelope.result.data);
            }).catch((err)=>{
                reject(TRPCClientError.from(err));
            });
        });
        return abortablePromise;
    }
    query(path, input, opts) {
        return this.requestAsPromise({
            type: 'query',
            path,
            input: input,
            context: opts?.context,
            signal: opts?.signal
        });
    }
    mutation(path, input, opts) {
        return this.requestAsPromise({
            type: 'mutation',
            path,
            input: input,
            context: opts?.context,
            signal: opts?.signal
        });
    }
    subscription(path, input, opts) {
        const observable$ = this.$request({
            type: 'subscription',
            path,
            input,
            context: opts?.context
        });
        return observable$.subscribe({
            next (envelope) {
                if (envelope.result.type === 'started') {
                    opts.onStarted?.();
                } else if (envelope.result.type === 'stopped') {
                    opts.onStopped?.();
                } else {
                    opts.onData?.(envelope.result.data);
                }
            },
            error (err) {
                opts.onError?.(err);
            },
            complete () {
                opts.onComplete?.();
            }
        });
    }
    constructor(opts){
        this.requestId = 0;
        function getTransformer() {
            if (!opts.transformer) return {
                serialize: (data)=>data,
                deserialize: (data)=>data
            };
            if ('input' in opts.transformer) return {
                serialize: opts.transformer.input.serialize,
                deserialize: opts.transformer.output.deserialize
            };
            return opts.transformer;
        }
        this.runtime = {
            transformer: getTransformer()
        };
        // Initialize the links
        this.links = opts.links.map((link)=>link(this.runtime));
    }
}

/**
 * @deprecated use `createTRPCProxyClient` instead
 */ function createTRPCClient(opts) {
    const getLinks = ()=>{
        if ('links' in opts) {
            return opts.links;
        }
        return [
            httpBatchLink(opts)
        ];
    };
    const client = new TRPCClient({
        transformer: opts.transformer,
        links: getLinks()
    });
    return client;
}

const clientCallTypeMap = {
    query: 'query',
    mutate: 'mutation',
    subscribe: 'subscription'
};
/**
 * @deprecated use `createTRPCProxyClient` instead
 * @internal
 */ function createTRPCClientProxy(client) {
    const proxy = createRecursiveProxy(({ path , args  })=>{
        const pathCopy = [
            ...path
        ];
        const clientCallType = pathCopy.pop();
        const procedureType = clientCallTypeMap[clientCallType];
        const fullPath = pathCopy.join('.');
        return client[procedureType](fullPath, ...args);
    });
    return proxy;
}
function createTRPCProxyClient(opts) {
    const client = new TRPCClient(opts);
    const proxy = createTRPCClientProxy(client);
    return proxy;
}

/**
 * We treat `undefined` as an input the same as omitting an `input`
 * https://github.com/trpc/trpc/issues/2290
 */
function getQueryKey(path, input) {
  return input === undefined ? [path] : [path, input];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Create proxy for decorating procedures
 * @internal
 */
function createSolidProxyDecoration(name, hooks) {
  return createRecursiveProxy(opts => {
    const args = opts.args;
    const pathCopy = [name, ...opts.path];

    // The last arg is for instance `.useMutation` or `.useQuery()`
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastArg = pathCopy.pop();

    // The `path` ends up being something like `post.byId`
    const path = pathCopy.join(".");
    if (lastArg === "useMutation") {
      return hooks[lastArg](path, ...args);
    }
    return hooks[lastArg](() => getQueryKey(path, typeof args[0] === "function" ? args[0]() : args[0]), args[1]);
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const contextProps = ["client", "abortOnUnmount"];

/** @internal */

const TRPCContext = createContext(null);

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @internal
 */
function createSolidQueryUtilsProxy(context) {
  return createFlatProxy(key => {
    const contextName = key;
    if (contextProps.includes(contextName)) {
      return context[contextName];
    }
    return createRecursiveProxy(({
      path,
      args
    }) => {
      const pathCopy = [key, ...path];
      const utilName = pathCopy.pop();
      const fullPath = pathCopy.join(".");
      const getOpts = name => {
        if (["setData", "setInfiniteData"].includes(name)) {
          const [updater, input, ...rest] = args;
          const queryKey = getQueryKey(fullPath, input);
          return {
            queryKey,
            updater,
            rest
          };
        }
        const [input, ...rest] = args;
        const queryKey = getQueryKey(fullPath, input);
        return {
          queryKey,
          rest
        };
      };
      const {
        queryKey,
        rest,
        updater
      } = getOpts(utilName);
      const contextMap = {
        fetch: () => context.fetchQuery(queryKey, ...rest),
        fetchInfinite: () => context.fetchInfiniteQuery(queryKey, ...rest),
        prefetch: () => context.prefetchQuery(queryKey, ...rest),
        prefetchInfinite: () => context.prefetchInfiniteQuery(queryKey, ...rest),
        invalidate: () => context.invalidateQueries(queryKey, ...rest),
        refetch: () => context.refetchQueries(queryKey, ...rest),
        cancel: () => context.cancelQuery(queryKey, ...rest),
        setData: () => context.setQueryData(queryKey, updater, ...rest),
        setInfiniteData: () => context.setInfiniteQueryData(queryKey, updater, ...rest),
        getData: () => context.getQueryData(queryKey),
        getInfiniteData: () => context.getInfiniteQueryData(queryKey)
      };
      return contextMap[utilName]();
    });
  });
}

class Subscribable {
  constructor() {
    this.listeners = [];
    this.subscribe = this.subscribe.bind(this);
  }

  subscribe(listener) {
    this.listeners.push(listener);
    this.onSubscribe();
    return () => {
      this.listeners = this.listeners.filter(x => x !== listener);
      this.onUnsubscribe();
    };
  }

  hasListeners() {
    return this.listeners.length > 0;
  }

  onSubscribe() {// Do nothing
  }

  onUnsubscribe() {// Do nothing
  }

}

// TYPES
// UTILS
const isServer = typeof window === 'undefined' || 'Deno' in window;
function noop$1() {
  return undefined;
}
function isValidTimeout(value) {
  return typeof value === 'number' && value >= 0 && value !== Infinity;
}
function timeUntilStale(updatedAt, staleTime) {
  return Math.max(updatedAt + (staleTime || 0) - Date.now(), 0);
}
/**
 * Default query keys hash function.
 * Hashes the value into a stable hash.
 */

function hashQueryKey(queryKey) {
  return JSON.stringify(queryKey, (_, val) => isPlainObject(val) ? Object.keys(val).sort().reduce((result, key) => {
    result[key] = val[key];
    return result;
  }, {}) : val);
}
/**
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between JSON values for example.
 */

function replaceEqualDeep(a, b) {
  if (a === b) {
    return a;
  }

  const array = isPlainArray(a) && isPlainArray(b);

  if (array || isPlainObject(a) && isPlainObject(b)) {
    const aSize = array ? a.length : Object.keys(a).length;
    const bItems = array ? b : Object.keys(b);
    const bSize = bItems.length;
    const copy = array ? [] : {};
    let equalItems = 0;

    for (let i = 0; i < bSize; i++) {
      const key = array ? i : bItems[i];
      copy[key] = replaceEqualDeep(a[key], b[key]);

      if (copy[key] === a[key]) {
        equalItems++;
      }
    }

    return aSize === bSize && equalItems === aSize ? a : copy;
  }

  return b;
}
/**
 * Shallow compare objects. Only works with objects that always have the same properties.
 */

function shallowEqualObjects(a, b) {
  if (a && !b || b && !a) {
    return false;
  }

  for (const key in a) {
    if (a[key] !== b[key]) {
      return false;
    }
  }

  return true;
}
function isPlainArray(value) {
  return Array.isArray(value) && value.length === Object.keys(value).length;
} // Copied from: https://github.com/jonschlinkert/is-plain-object

function isPlainObject(o) {
  if (!hasObjectPrototype(o)) {
    return false;
  } // If has modified constructor


  const ctor = o.constructor;

  if (typeof ctor === 'undefined') {
    return true;
  } // If has modified prototype


  const prot = ctor.prototype;

  if (!hasObjectPrototype(prot)) {
    return false;
  } // If constructor does not have an Object-specific method


  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false;
  } // Most likely a plain Object


  return true;
}

function hasObjectPrototype(o) {
  return Object.prototype.toString.call(o) === '[object Object]';
}
function sleep(timeout) {
  return new Promise(resolve => {
    setTimeout(resolve, timeout);
  });
}
/**
 * Schedules a microtask.
 * This can be useful to schedule state updates after rendering.
 */

function scheduleMicrotask(callback) {
  sleep(0).then(callback);
}
function replaceData(prevData, data, options) {
  // Use prev data if an isDataEqual function is defined and returns `true`
  if (options.isDataEqual != null && options.isDataEqual(prevData, data)) {
    return prevData;
  } else if (typeof options.structuralSharing === 'function') {
    return options.structuralSharing(prevData, data);
  } else if (options.structuralSharing !== false) {
    // Structurally share data between prev and new data if needed
    return replaceEqualDeep(prevData, data);
  }

  return data;
}

class FocusManager extends Subscribable {
  constructor() {
    super();

    this.setup = onFocus => {
      // addEventListener does not exist in React Native, but window does
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!isServer && window.addEventListener) {
        const listener = () => onFocus(); // Listen to visibillitychange and focus


        window.addEventListener('visibilitychange', listener, false);
        window.addEventListener('focus', listener, false);
        return () => {
          // Be sure to unsubscribe if a new handler is set
          window.removeEventListener('visibilitychange', listener);
          window.removeEventListener('focus', listener);
        };
      }
    };
  }

  onSubscribe() {
    if (!this.cleanup) {
      this.setEventListener(this.setup);
    }
  }

  onUnsubscribe() {
    if (!this.hasListeners()) {
      var _this$cleanup;

      (_this$cleanup = this.cleanup) == null ? void 0 : _this$cleanup.call(this);
      this.cleanup = undefined;
    }
  }

  setEventListener(setup) {
    var _this$cleanup2;

    this.setup = setup;
    (_this$cleanup2 = this.cleanup) == null ? void 0 : _this$cleanup2.call(this);
    this.cleanup = setup(focused => {
      if (typeof focused === 'boolean') {
        this.setFocused(focused);
      } else {
        this.onFocus();
      }
    });
  }

  setFocused(focused) {
    this.focused = focused;

    if (focused) {
      this.onFocus();
    }
  }

  onFocus() {
    this.listeners.forEach(listener => {
      listener();
    });
  }

  isFocused() {
    if (typeof this.focused === 'boolean') {
      return this.focused;
    } // document global can be unavailable in react native


    if (typeof document === 'undefined') {
      return true;
    }

    return [undefined, 'visible', 'prerender'].includes(document.visibilityState);
  }

}
const focusManager = new FocusManager();

class OnlineManager extends Subscribable {
  constructor() {
    super();

    this.setup = onOnline => {
      // addEventListener does not exist in React Native, but window does
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!isServer && window.addEventListener) {
        const listener = () => onOnline(); // Listen to online


        window.addEventListener('online', listener, false);
        window.addEventListener('offline', listener, false);
        return () => {
          // Be sure to unsubscribe if a new handler is set
          window.removeEventListener('online', listener);
          window.removeEventListener('offline', listener);
        };
      }
    };
  }

  onSubscribe() {
    if (!this.cleanup) {
      this.setEventListener(this.setup);
    }
  }

  onUnsubscribe() {
    if (!this.hasListeners()) {
      var _this$cleanup;

      (_this$cleanup = this.cleanup) == null ? void 0 : _this$cleanup.call(this);
      this.cleanup = undefined;
    }
  }

  setEventListener(setup) {
    var _this$cleanup2;

    this.setup = setup;
    (_this$cleanup2 = this.cleanup) == null ? void 0 : _this$cleanup2.call(this);
    this.cleanup = setup(online => {
      if (typeof online === 'boolean') {
        this.setOnline(online);
      } else {
        this.onOnline();
      }
    });
  }

  setOnline(online) {
    this.online = online;

    if (online) {
      this.onOnline();
    }
  }

  onOnline() {
    this.listeners.forEach(listener => {
      listener();
    });
  }

  isOnline() {
    if (typeof this.online === 'boolean') {
      return this.online;
    }

    if (typeof navigator === 'undefined' || typeof navigator.onLine === 'undefined') {
      return true;
    }

    return navigator.onLine;
  }

}
const onlineManager = new OnlineManager();

function defaultRetryDelay(failureCount) {
  return Math.min(1000 * 2 ** failureCount, 30000);
}

function canFetch(networkMode) {
  return (networkMode != null ? networkMode : 'online') === 'online' ? onlineManager.isOnline() : true;
}
class CancelledError {
  constructor(options) {
    this.revert = options == null ? void 0 : options.revert;
    this.silent = options == null ? void 0 : options.silent;
  }

}
function isCancelledError(value) {
  return value instanceof CancelledError;
}
function createRetryer(config) {
  let isRetryCancelled = false;
  let failureCount = 0;
  let isResolved = false;
  let continueFn;
  let promiseResolve;
  let promiseReject;
  const promise = new Promise((outerResolve, outerReject) => {
    promiseResolve = outerResolve;
    promiseReject = outerReject;
  });

  const cancel = cancelOptions => {
    if (!isResolved) {
      reject(new CancelledError(cancelOptions));
      config.abort == null ? void 0 : config.abort();
    }
  };

  const cancelRetry = () => {
    isRetryCancelled = true;
  };

  const continueRetry = () => {
    isRetryCancelled = false;
  };

  const shouldPause = () => !focusManager.isFocused() || config.networkMode !== 'always' && !onlineManager.isOnline();

  const resolve = value => {
    if (!isResolved) {
      isResolved = true;
      config.onSuccess == null ? void 0 : config.onSuccess(value);
      continueFn == null ? void 0 : continueFn();
      promiseResolve(value);
    }
  };

  const reject = value => {
    if (!isResolved) {
      isResolved = true;
      config.onError == null ? void 0 : config.onError(value);
      continueFn == null ? void 0 : continueFn();
      promiseReject(value);
    }
  };

  const pause = () => {
    return new Promise(continueResolve => {
      continueFn = value => {
        if (isResolved || !shouldPause()) {
          return continueResolve(value);
        }
      };

      config.onPause == null ? void 0 : config.onPause();
    }).then(() => {
      continueFn = undefined;

      if (!isResolved) {
        config.onContinue == null ? void 0 : config.onContinue();
      }
    });
  }; // Create loop function


  const run = () => {
    // Do nothing if already resolved
    if (isResolved) {
      return;
    }

    let promiseOrValue; // Execute query

    try {
      promiseOrValue = config.fn();
    } catch (error) {
      promiseOrValue = Promise.reject(error);
    }

    Promise.resolve(promiseOrValue).then(resolve).catch(error => {
      var _config$retry, _config$retryDelay;

      // Stop if the fetch is already resolved
      if (isResolved) {
        return;
      } // Do we need to retry the request?


      const retry = (_config$retry = config.retry) != null ? _config$retry : 3;
      const retryDelay = (_config$retryDelay = config.retryDelay) != null ? _config$retryDelay : defaultRetryDelay;
      const delay = typeof retryDelay === 'function' ? retryDelay(failureCount, error) : retryDelay;
      const shouldRetry = retry === true || typeof retry === 'number' && failureCount < retry || typeof retry === 'function' && retry(failureCount, error);

      if (isRetryCancelled || !shouldRetry) {
        // We are done if the query does not need to be retried
        reject(error);
        return;
      }

      failureCount++; // Notify on fail

      config.onFail == null ? void 0 : config.onFail(failureCount, error); // Delay

      sleep(delay) // Pause if the document is not visible or when the device is offline
      .then(() => {
        if (shouldPause()) {
          return pause();
        }
      }).then(() => {
        if (isRetryCancelled) {
          reject(error);
        } else {
          run();
        }
      });
    });
  }; // Start loop


  if (canFetch(config.networkMode)) {
    run();
  } else {
    pause().then(run);
  }

  return {
    promise,
    cancel,
    continue: () => {
      continueFn == null ? void 0 : continueFn();
    },
    cancelRetry,
    continueRetry
  };
}

const defaultLogger = console;

function createNotifyManager() {
  let queue = [];
  let transactions = 0;

  let notifyFn = callback => {
    callback();
  };

  let batchNotifyFn = callback => {
    callback();
  };

  const batch = callback => {
    let result;
    transactions++;

    try {
      result = callback();
    } finally {
      transactions--;

      if (!transactions) {
        flush();
      }
    }

    return result;
  };

  const schedule = callback => {
    if (transactions) {
      queue.push(callback);
    } else {
      scheduleMicrotask(() => {
        notifyFn(callback);
      });
    }
  };
  /**
   * All calls to the wrapped function will be batched.
   */


  const batchCalls = callback => {
    return (...args) => {
      schedule(() => {
        callback(...args);
      });
    };
  };

  const flush = () => {
    const originalQueue = queue;
    queue = [];

    if (originalQueue.length) {
      scheduleMicrotask(() => {
        batchNotifyFn(() => {
          originalQueue.forEach(callback => {
            notifyFn(callback);
          });
        });
      });
    }
  };
  /**
   * Use this method to set a custom notify function.
   * This can be used to for example wrap notifications with `React.act` while running tests.
   */


  const setNotifyFunction = fn => {
    notifyFn = fn;
  };
  /**
   * Use this method to set a custom function to batch notifications together into a single tick.
   * By default React Query will use the batch function provided by ReactDOM or React Native.
   */


  const setBatchNotifyFunction = fn => {
    batchNotifyFn = fn;
  };

  return {
    batch,
    batchCalls,
    schedule,
    setNotifyFunction,
    setBatchNotifyFunction
  };
} // SINGLETON

const notifyManager = createNotifyManager();

class Removable {
  destroy() {
    this.clearGcTimeout();
  }

  scheduleGc() {
    this.clearGcTimeout();

    if (isValidTimeout(this.cacheTime)) {
      this.gcTimeout = setTimeout(() => {
        this.optionalRemove();
      }, this.cacheTime);
    }
  }

  updateCacheTime(newCacheTime) {
    // Default to 5 minutes (Infinity for server-side) if no cache time is set
    this.cacheTime = Math.max(this.cacheTime || 0, newCacheTime != null ? newCacheTime : isServer ? Infinity : 5 * 60 * 1000);
  }

  clearGcTimeout() {
    if (this.gcTimeout) {
      clearTimeout(this.gcTimeout);
      this.gcTimeout = undefined;
    }
  }

}

// CLASS
class Mutation extends Removable {
  constructor(config) {
    super();
    this.options = { ...config.defaultOptions,
      ...config.options
    };
    this.mutationId = config.mutationId;
    this.mutationCache = config.mutationCache;
    this.logger = config.logger || defaultLogger;
    this.observers = [];
    this.state = config.state || getDefaultState();
    this.updateCacheTime(this.options.cacheTime);
    this.scheduleGc();
  }

  get meta() {
    return this.options.meta;
  }

  setState(state) {
    this.dispatch({
      type: 'setState',
      state
    });
  }

  addObserver(observer) {
    if (this.observers.indexOf(observer) === -1) {
      this.observers.push(observer); // Stop the mutation from being garbage collected

      this.clearGcTimeout();
      this.mutationCache.notify({
        type: 'observerAdded',
        mutation: this,
        observer
      });
    }
  }

  removeObserver(observer) {
    this.observers = this.observers.filter(x => x !== observer);
    this.scheduleGc();
    this.mutationCache.notify({
      type: 'observerRemoved',
      mutation: this,
      observer
    });
  }

  optionalRemove() {
    if (!this.observers.length) {
      if (this.state.status === 'loading') {
        this.scheduleGc();
      } else {
        this.mutationCache.remove(this);
      }
    }
  }

  continue() {
    if (this.retryer) {
      this.retryer.continue();
      return this.retryer.promise;
    }

    return this.execute();
  }

  async execute() {
    const executeMutation = () => {
      var _this$options$retry;

      this.retryer = createRetryer({
        fn: () => {
          if (!this.options.mutationFn) {
            return Promise.reject('No mutationFn found');
          }

          return this.options.mutationFn(this.state.variables);
        },
        onFail: (failureCount, error) => {
          this.dispatch({
            type: 'failed',
            failureCount,
            error
          });
        },
        onPause: () => {
          this.dispatch({
            type: 'pause'
          });
        },
        onContinue: () => {
          this.dispatch({
            type: 'continue'
          });
        },
        retry: (_this$options$retry = this.options.retry) != null ? _this$options$retry : 0,
        retryDelay: this.options.retryDelay,
        networkMode: this.options.networkMode
      });
      return this.retryer.promise;
    };

    const restored = this.state.status === 'loading';

    try {
      var _this$mutationCache$c3, _this$mutationCache$c4, _this$options$onSucce, _this$options2, _this$options$onSettl, _this$options3;

      if (!restored) {
        var _this$mutationCache$c, _this$mutationCache$c2, _this$options$onMutat, _this$options;

        this.dispatch({
          type: 'loading',
          variables: this.options.variables
        }); // Notify cache callback

        await ((_this$mutationCache$c = (_this$mutationCache$c2 = this.mutationCache.config).onMutate) == null ? void 0 : _this$mutationCache$c.call(_this$mutationCache$c2, this.state.variables, this));
        const context = await ((_this$options$onMutat = (_this$options = this.options).onMutate) == null ? void 0 : _this$options$onMutat.call(_this$options, this.state.variables));

        if (context !== this.state.context) {
          this.dispatch({
            type: 'loading',
            context,
            variables: this.state.variables
          });
        }
      }

      const data = await executeMutation(); // Notify cache callback

      await ((_this$mutationCache$c3 = (_this$mutationCache$c4 = this.mutationCache.config).onSuccess) == null ? void 0 : _this$mutationCache$c3.call(_this$mutationCache$c4, data, this.state.variables, this.state.context, this));
      await ((_this$options$onSucce = (_this$options2 = this.options).onSuccess) == null ? void 0 : _this$options$onSucce.call(_this$options2, data, this.state.variables, this.state.context));
      await ((_this$options$onSettl = (_this$options3 = this.options).onSettled) == null ? void 0 : _this$options$onSettl.call(_this$options3, data, null, this.state.variables, this.state.context));
      this.dispatch({
        type: 'success',
        data
      });
      return data;
    } catch (error) {
      try {
        var _this$mutationCache$c5, _this$mutationCache$c6, _this$options$onError, _this$options4, _this$options$onSettl2, _this$options5;

        // Notify cache callback
        await ((_this$mutationCache$c5 = (_this$mutationCache$c6 = this.mutationCache.config).onError) == null ? void 0 : _this$mutationCache$c5.call(_this$mutationCache$c6, error, this.state.variables, this.state.context, this));

        if (process.env.NODE_ENV !== 'production') {
          this.logger.error(error);
        }

        await ((_this$options$onError = (_this$options4 = this.options).onError) == null ? void 0 : _this$options$onError.call(_this$options4, error, this.state.variables, this.state.context));
        await ((_this$options$onSettl2 = (_this$options5 = this.options).onSettled) == null ? void 0 : _this$options$onSettl2.call(_this$options5, undefined, error, this.state.variables, this.state.context));
        throw error;
      } finally {
        this.dispatch({
          type: 'error',
          error: error
        });
      }
    }
  }

  dispatch(action) {
    const reducer = state => {
      switch (action.type) {
        case 'failed':
          return { ...state,
            failureCount: action.failureCount,
            failureReason: action.error
          };

        case 'pause':
          return { ...state,
            isPaused: true
          };

        case 'continue':
          return { ...state,
            isPaused: false
          };

        case 'loading':
          return { ...state,
            context: action.context,
            data: undefined,
            failureCount: 0,
            failureReason: null,
            error: null,
            isPaused: !canFetch(this.options.networkMode),
            status: 'loading',
            variables: action.variables
          };

        case 'success':
          return { ...state,
            data: action.data,
            failureCount: 0,
            failureReason: null,
            error: null,
            status: 'success',
            isPaused: false
          };

        case 'error':
          return { ...state,
            data: undefined,
            error: action.error,
            failureCount: state.failureCount + 1,
            failureReason: action.error,
            isPaused: false,
            status: 'error'
          };

        case 'setState':
          return { ...state,
            ...action.state
          };
      }
    };

    this.state = reducer(this.state);
    notifyManager.batch(() => {
      this.observers.forEach(observer => {
        observer.onMutationUpdate(action);
      });
      this.mutationCache.notify({
        mutation: this,
        type: 'updated',
        action
      });
    });
  }

}
function getDefaultState() {
  return {
    context: undefined,
    data: undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    status: 'idle',
    variables: undefined
  };
}

function infiniteQueryBehavior() {
  return {
    onFetch: context => {
      context.fetchFn = () => {
        var _context$fetchOptions, _context$fetchOptions2, _context$fetchOptions3, _context$fetchOptions4, _context$state$data, _context$state$data2;

        const refetchPage = (_context$fetchOptions = context.fetchOptions) == null ? void 0 : (_context$fetchOptions2 = _context$fetchOptions.meta) == null ? void 0 : _context$fetchOptions2.refetchPage;
        const fetchMore = (_context$fetchOptions3 = context.fetchOptions) == null ? void 0 : (_context$fetchOptions4 = _context$fetchOptions3.meta) == null ? void 0 : _context$fetchOptions4.fetchMore;
        const pageParam = fetchMore == null ? void 0 : fetchMore.pageParam;
        const isFetchingNextPage = (fetchMore == null ? void 0 : fetchMore.direction) === 'forward';
        const isFetchingPreviousPage = (fetchMore == null ? void 0 : fetchMore.direction) === 'backward';
        const oldPages = ((_context$state$data = context.state.data) == null ? void 0 : _context$state$data.pages) || [];
        const oldPageParams = ((_context$state$data2 = context.state.data) == null ? void 0 : _context$state$data2.pageParams) || [];
        let newPageParams = oldPageParams;
        let cancelled = false;

        const addSignalProperty = object => {
          Object.defineProperty(object, 'signal', {
            enumerable: true,
            get: () => {
              var _context$signal;

              if ((_context$signal = context.signal) != null && _context$signal.aborted) {
                cancelled = true;
              } else {
                var _context$signal2;

                (_context$signal2 = context.signal) == null ? void 0 : _context$signal2.addEventListener('abort', () => {
                  cancelled = true;
                });
              }

              return context.signal;
            }
          });
        }; // Get query function


        const queryFn = context.options.queryFn || (() => Promise.reject('Missing queryFn'));

        const buildNewPages = (pages, param, page, previous) => {
          newPageParams = previous ? [param, ...newPageParams] : [...newPageParams, param];
          return previous ? [page, ...pages] : [...pages, page];
        }; // Create function to fetch a page


        const fetchPage = (pages, manual, param, previous) => {
          if (cancelled) {
            return Promise.reject('Cancelled');
          }

          if (typeof param === 'undefined' && !manual && pages.length) {
            return Promise.resolve(pages);
          }

          const queryFnContext = {
            queryKey: context.queryKey,
            pageParam: param,
            meta: context.options.meta
          };
          addSignalProperty(queryFnContext);
          const queryFnResult = queryFn(queryFnContext);
          const promise = Promise.resolve(queryFnResult).then(page => buildNewPages(pages, param, page, previous));
          return promise;
        };

        let promise; // Fetch first page?

        if (!oldPages.length) {
          promise = fetchPage([]);
        } // Fetch next page?
        else if (isFetchingNextPage) {
          const manual = typeof pageParam !== 'undefined';
          const param = manual ? pageParam : getNextPageParam(context.options, oldPages);
          promise = fetchPage(oldPages, manual, param);
        } // Fetch previous page?
        else if (isFetchingPreviousPage) {
          const manual = typeof pageParam !== 'undefined';
          const param = manual ? pageParam : getPreviousPageParam(context.options, oldPages);
          promise = fetchPage(oldPages, manual, param, true);
        } // Refetch pages
        else {
          newPageParams = [];
          const manual = typeof context.options.getNextPageParam === 'undefined';
          const shouldFetchFirstPage = refetchPage && oldPages[0] ? refetchPage(oldPages[0], 0, oldPages) : true; // Fetch first page

          promise = shouldFetchFirstPage ? fetchPage([], manual, oldPageParams[0]) : Promise.resolve(buildNewPages([], oldPageParams[0], oldPages[0])); // Fetch remaining pages

          for (let i = 1; i < oldPages.length; i++) {
            promise = promise.then(pages => {
              const shouldFetchNextPage = refetchPage && oldPages[i] ? refetchPage(oldPages[i], i, oldPages) : true;

              if (shouldFetchNextPage) {
                const param = manual ? oldPageParams[i] : getNextPageParam(context.options, pages);
                return fetchPage(pages, manual, param);
              }

              return Promise.resolve(buildNewPages(pages, oldPageParams[i], oldPages[i]));
            });
          }
        }

        const finalPromise = promise.then(pages => ({
          pages,
          pageParams: newPageParams
        }));
        return finalPromise;
      };
    }
  };
}
function getNextPageParam(options, pages) {
  return options.getNextPageParam == null ? void 0 : options.getNextPageParam(pages[pages.length - 1], pages);
}
function getPreviousPageParam(options, pages) {
  return options.getPreviousPageParam == null ? void 0 : options.getPreviousPageParam(pages[0], pages);
}
/**
 * Checks if there is a next page.
 * Returns `undefined` if it cannot be determined.
 */

function hasNextPage(options, pages) {
  if (options.getNextPageParam && Array.isArray(pages)) {
    const nextPageParam = getNextPageParam(options, pages);
    return typeof nextPageParam !== 'undefined' && nextPageParam !== null && nextPageParam !== false;
  }
}
/**
 * Checks if there is a previous page.
 * Returns `undefined` if it cannot be determined.
 */

function hasPreviousPage(options, pages) {
  if (options.getPreviousPageParam && Array.isArray(pages)) {
    const previousPageParam = getPreviousPageParam(options, pages);
    return typeof previousPageParam !== 'undefined' && previousPageParam !== null && previousPageParam !== false;
  }
}

class QueryObserver extends Subscribable {
  constructor(client, options) {
    super();
    this.client = client;
    this.options = options;
    this.trackedProps = new Set();
    this.selectError = null;
    this.bindMethods();
    this.setOptions(options);
  }

  bindMethods() {
    this.remove = this.remove.bind(this);
    this.refetch = this.refetch.bind(this);
  }

  onSubscribe() {
    if (this.listeners.length === 1) {
      this.currentQuery.addObserver(this);

      if (shouldFetchOnMount(this.currentQuery, this.options)) {
        this.executeFetch();
      }

      this.updateTimers();
    }
  }

  onUnsubscribe() {
    if (!this.listeners.length) {
      this.destroy();
    }
  }

  shouldFetchOnReconnect() {
    return shouldFetchOn(this.currentQuery, this.options, this.options.refetchOnReconnect);
  }

  shouldFetchOnWindowFocus() {
    return shouldFetchOn(this.currentQuery, this.options, this.options.refetchOnWindowFocus);
  }

  destroy() {
    this.listeners = [];
    this.clearStaleTimeout();
    this.clearRefetchInterval();
    this.currentQuery.removeObserver(this);
  }

  setOptions(options, notifyOptions) {
    const prevOptions = this.options;
    const prevQuery = this.currentQuery;
    this.options = this.client.defaultQueryOptions(options);

    if (process.env.NODE_ENV !== 'production' && typeof (options == null ? void 0 : options.isDataEqual) !== 'undefined') {
      this.client.getLogger().error("The isDataEqual option has been deprecated and will be removed in the next major version. You can achieve the same functionality by passing a function as the structuralSharing option");
    }

    if (!shallowEqualObjects(prevOptions, this.options)) {
      this.client.getQueryCache().notify({
        type: 'observerOptionsUpdated',
        query: this.currentQuery,
        observer: this
      });
    }

    if (typeof this.options.enabled !== 'undefined' && typeof this.options.enabled !== 'boolean') {
      throw new Error('Expected enabled to be a boolean');
    } // Keep previous query key if the user does not supply one


    if (!this.options.queryKey) {
      this.options.queryKey = prevOptions.queryKey;
    }

    this.updateQuery();
    const mounted = this.hasListeners(); // Fetch if there are subscribers

    if (mounted && shouldFetchOptionally(this.currentQuery, prevQuery, this.options, prevOptions)) {
      this.executeFetch();
    } // Update result


    this.updateResult(notifyOptions); // Update stale interval if needed

    if (mounted && (this.currentQuery !== prevQuery || this.options.enabled !== prevOptions.enabled || this.options.staleTime !== prevOptions.staleTime)) {
      this.updateStaleTimeout();
    }

    const nextRefetchInterval = this.computeRefetchInterval(); // Update refetch interval if needed

    if (mounted && (this.currentQuery !== prevQuery || this.options.enabled !== prevOptions.enabled || nextRefetchInterval !== this.currentRefetchInterval)) {
      this.updateRefetchInterval(nextRefetchInterval);
    }
  }

  getOptimisticResult(options) {
    const query = this.client.getQueryCache().build(this.client, options);
    return this.createResult(query, options);
  }

  getCurrentResult() {
    return this.currentResult;
  }

  trackResult(result) {
    const trackedResult = {};
    Object.keys(result).forEach(key => {
      Object.defineProperty(trackedResult, key, {
        configurable: false,
        enumerable: true,
        get: () => {
          this.trackedProps.add(key);
          return result[key];
        }
      });
    });
    return trackedResult;
  }

  getCurrentQuery() {
    return this.currentQuery;
  }

  remove() {
    this.client.getQueryCache().remove(this.currentQuery);
  }

  refetch({
    refetchPage,
    ...options
  } = {}) {
    return this.fetch({ ...options,
      meta: {
        refetchPage
      }
    });
  }

  fetchOptimistic(options) {
    const defaultedOptions = this.client.defaultQueryOptions(options);
    const query = this.client.getQueryCache().build(this.client, defaultedOptions);
    query.isFetchingOptimistic = true;
    return query.fetch().then(() => this.createResult(query, defaultedOptions));
  }

  fetch(fetchOptions) {
    var _fetchOptions$cancelR;

    return this.executeFetch({ ...fetchOptions,
      cancelRefetch: (_fetchOptions$cancelR = fetchOptions.cancelRefetch) != null ? _fetchOptions$cancelR : true
    }).then(() => {
      this.updateResult();
      return this.currentResult;
    });
  }

  executeFetch(fetchOptions) {
    // Make sure we reference the latest query as the current one might have been removed
    this.updateQuery(); // Fetch

    let promise = this.currentQuery.fetch(this.options, fetchOptions);

    if (!(fetchOptions != null && fetchOptions.throwOnError)) {
      promise = promise.catch(noop$1);
    }

    return promise;
  }

  updateStaleTimeout() {
    this.clearStaleTimeout();

    if (isServer || this.currentResult.isStale || !isValidTimeout(this.options.staleTime)) {
      return;
    }

    const time = timeUntilStale(this.currentResult.dataUpdatedAt, this.options.staleTime); // The timeout is sometimes triggered 1 ms before the stale time expiration.
    // To mitigate this issue we always add 1 ms to the timeout.

    const timeout = time + 1;
    this.staleTimeoutId = setTimeout(() => {
      if (!this.currentResult.isStale) {
        this.updateResult();
      }
    }, timeout);
  }

  computeRefetchInterval() {
    var _this$options$refetch;

    return typeof this.options.refetchInterval === 'function' ? this.options.refetchInterval(this.currentResult.data, this.currentQuery) : (_this$options$refetch = this.options.refetchInterval) != null ? _this$options$refetch : false;
  }

  updateRefetchInterval(nextInterval) {
    this.clearRefetchInterval();
    this.currentRefetchInterval = nextInterval;

    if (isServer || this.options.enabled === false || !isValidTimeout(this.currentRefetchInterval) || this.currentRefetchInterval === 0) {
      return;
    }

    this.refetchIntervalId = setInterval(() => {
      if (this.options.refetchIntervalInBackground || focusManager.isFocused()) {
        this.executeFetch();
      }
    }, this.currentRefetchInterval);
  }

  updateTimers() {
    this.updateStaleTimeout();
    this.updateRefetchInterval(this.computeRefetchInterval());
  }

  clearStaleTimeout() {
    if (this.staleTimeoutId) {
      clearTimeout(this.staleTimeoutId);
      this.staleTimeoutId = undefined;
    }
  }

  clearRefetchInterval() {
    if (this.refetchIntervalId) {
      clearInterval(this.refetchIntervalId);
      this.refetchIntervalId = undefined;
    }
  }

  createResult(query, options) {
    const prevQuery = this.currentQuery;
    const prevOptions = this.options;
    const prevResult = this.currentResult;
    const prevResultState = this.currentResultState;
    const prevResultOptions = this.currentResultOptions;
    const queryChange = query !== prevQuery;
    const queryInitialState = queryChange ? query.state : this.currentQueryInitialState;
    const prevQueryResult = queryChange ? this.currentResult : this.previousQueryResult;
    const {
      state
    } = query;
    let {
      dataUpdatedAt,
      error,
      errorUpdatedAt,
      fetchStatus,
      status
    } = state;
    let isPreviousData = false;
    let isPlaceholderData = false;
    let data; // Optimistically set result in fetching state if needed

    if (options._optimisticResults) {
      const mounted = this.hasListeners();
      const fetchOnMount = !mounted && shouldFetchOnMount(query, options);
      const fetchOptionally = mounted && shouldFetchOptionally(query, prevQuery, options, prevOptions);

      if (fetchOnMount || fetchOptionally) {
        fetchStatus = canFetch(query.options.networkMode) ? 'fetching' : 'paused';

        if (!dataUpdatedAt) {
          status = 'loading';
        }
      }

      if (options._optimisticResults === 'isRestoring') {
        fetchStatus = 'idle';
      }
    } // Keep previous data if needed


    if (options.keepPreviousData && !state.dataUpdatedAt && prevQueryResult != null && prevQueryResult.isSuccess && status !== 'error') {
      data = prevQueryResult.data;
      dataUpdatedAt = prevQueryResult.dataUpdatedAt;
      status = prevQueryResult.status;
      isPreviousData = true;
    } // Select data if needed
    else if (options.select && typeof state.data !== 'undefined') {
      // Memoize select result
      if (prevResult && state.data === (prevResultState == null ? void 0 : prevResultState.data) && options.select === this.selectFn) {
        data = this.selectResult;
      } else {
        try {
          this.selectFn = options.select;
          data = options.select(state.data);
          data = replaceData(prevResult == null ? void 0 : prevResult.data, data, options);
          this.selectResult = data;
          this.selectError = null;
        } catch (selectError) {
          if (process.env.NODE_ENV !== 'production') {
            this.client.getLogger().error(selectError);
          }

          this.selectError = selectError;
        }
      }
    } // Use query data
    else {
      data = state.data;
    } // Show placeholder data if needed


    if (typeof options.placeholderData !== 'undefined' && typeof data === 'undefined' && status === 'loading') {
      let placeholderData; // Memoize placeholder data

      if (prevResult != null && prevResult.isPlaceholderData && options.placeholderData === (prevResultOptions == null ? void 0 : prevResultOptions.placeholderData)) {
        placeholderData = prevResult.data;
      } else {
        placeholderData = typeof options.placeholderData === 'function' ? options.placeholderData() : options.placeholderData;

        if (options.select && typeof placeholderData !== 'undefined') {
          try {
            placeholderData = options.select(placeholderData);
            this.selectError = null;
          } catch (selectError) {
            if (process.env.NODE_ENV !== 'production') {
              this.client.getLogger().error(selectError);
            }

            this.selectError = selectError;
          }
        }
      }

      if (typeof placeholderData !== 'undefined') {
        status = 'success';
        data = replaceData(prevResult == null ? void 0 : prevResult.data, placeholderData, options);
        isPlaceholderData = true;
      }
    }

    if (this.selectError) {
      error = this.selectError;
      data = this.selectResult;
      errorUpdatedAt = Date.now();
      status = 'error';
    }

    const isFetching = fetchStatus === 'fetching';
    const isLoading = status === 'loading';
    const isError = status === 'error';
    const result = {
      status,
      fetchStatus,
      isLoading,
      isSuccess: status === 'success',
      isError,
      isInitialLoading: isLoading && isFetching,
      data,
      dataUpdatedAt,
      error,
      errorUpdatedAt,
      failureCount: state.fetchFailureCount,
      failureReason: state.fetchFailureReason,
      errorUpdateCount: state.errorUpdateCount,
      isFetched: state.dataUpdateCount > 0 || state.errorUpdateCount > 0,
      isFetchedAfterMount: state.dataUpdateCount > queryInitialState.dataUpdateCount || state.errorUpdateCount > queryInitialState.errorUpdateCount,
      isFetching,
      isRefetching: isFetching && !isLoading,
      isLoadingError: isError && state.dataUpdatedAt === 0,
      isPaused: fetchStatus === 'paused',
      isPlaceholderData,
      isPreviousData,
      isRefetchError: isError && state.dataUpdatedAt !== 0,
      isStale: isStale(query, options),
      refetch: this.refetch,
      remove: this.remove
    };
    return result;
  }

  updateResult(notifyOptions) {
    const prevResult = this.currentResult;
    const nextResult = this.createResult(this.currentQuery, this.options);
    this.currentResultState = this.currentQuery.state;
    this.currentResultOptions = this.options; // Only notify and update result if something has changed

    if (shallowEqualObjects(nextResult, prevResult)) {
      return;
    }

    this.currentResult = nextResult; // Determine which callbacks to trigger

    const defaultNotifyOptions = {
      cache: true
    };

    const shouldNotifyListeners = () => {
      if (!prevResult) {
        return true;
      }

      const {
        notifyOnChangeProps
      } = this.options;

      if (notifyOnChangeProps === 'all' || !notifyOnChangeProps && !this.trackedProps.size) {
        return true;
      }

      const includedProps = new Set(notifyOnChangeProps != null ? notifyOnChangeProps : this.trackedProps);

      if (this.options.useErrorBoundary) {
        includedProps.add('error');
      }

      return Object.keys(this.currentResult).some(key => {
        const typedKey = key;
        const changed = this.currentResult[typedKey] !== prevResult[typedKey];
        return changed && includedProps.has(typedKey);
      });
    };

    if ((notifyOptions == null ? void 0 : notifyOptions.listeners) !== false && shouldNotifyListeners()) {
      defaultNotifyOptions.listeners = true;
    }

    this.notify({ ...defaultNotifyOptions,
      ...notifyOptions
    });
  }

  updateQuery() {
    const query = this.client.getQueryCache().build(this.client, this.options);

    if (query === this.currentQuery) {
      return;
    }

    const prevQuery = this.currentQuery;
    this.currentQuery = query;
    this.currentQueryInitialState = query.state;
    this.previousQueryResult = this.currentResult;

    if (this.hasListeners()) {
      prevQuery == null ? void 0 : prevQuery.removeObserver(this);
      query.addObserver(this);
    }
  }

  onQueryUpdate(action) {
    const notifyOptions = {};

    if (action.type === 'success') {
      notifyOptions.onSuccess = !action.manual;
    } else if (action.type === 'error' && !isCancelledError(action.error)) {
      notifyOptions.onError = true;
    }

    this.updateResult(notifyOptions);

    if (this.hasListeners()) {
      this.updateTimers();
    }
  }

  notify(notifyOptions) {
    notifyManager.batch(() => {
      // First trigger the configuration callbacks
      if (notifyOptions.onSuccess) {
        var _this$options$onSucce, _this$options, _this$options$onSettl, _this$options2;

        (_this$options$onSucce = (_this$options = this.options).onSuccess) == null ? void 0 : _this$options$onSucce.call(_this$options, this.currentResult.data);
        (_this$options$onSettl = (_this$options2 = this.options).onSettled) == null ? void 0 : _this$options$onSettl.call(_this$options2, this.currentResult.data, null);
      } else if (notifyOptions.onError) {
        var _this$options$onError, _this$options3, _this$options$onSettl2, _this$options4;

        (_this$options$onError = (_this$options3 = this.options).onError) == null ? void 0 : _this$options$onError.call(_this$options3, this.currentResult.error);
        (_this$options$onSettl2 = (_this$options4 = this.options).onSettled) == null ? void 0 : _this$options$onSettl2.call(_this$options4, undefined, this.currentResult.error);
      } // Then trigger the listeners


      if (notifyOptions.listeners) {
        this.listeners.forEach(listener => {
          listener(this.currentResult);
        });
      } // Then the cache listeners


      if (notifyOptions.cache) {
        this.client.getQueryCache().notify({
          query: this.currentQuery,
          type: 'observerResultsUpdated'
        });
      }
    });
  }

}

function shouldLoadOnMount(query, options) {
  return options.enabled !== false && !query.state.dataUpdatedAt && !(query.state.status === 'error' && options.retryOnMount === false);
}

function shouldFetchOnMount(query, options) {
  return shouldLoadOnMount(query, options) || query.state.dataUpdatedAt > 0 && shouldFetchOn(query, options, options.refetchOnMount);
}

function shouldFetchOn(query, options, field) {
  if (options.enabled !== false) {
    const value = typeof field === 'function' ? field(query) : field;
    return value === 'always' || value !== false && isStale(query, options);
  }

  return false;
}

function shouldFetchOptionally(query, prevQuery, options, prevOptions) {
  return options.enabled !== false && (query !== prevQuery || prevOptions.enabled === false) && (!options.suspense || query.state.status !== 'error') && isStale(query, options);
}

function isStale(query, options) {
  return query.isStaleByTime(options.staleTime);
}

class InfiniteQueryObserver extends QueryObserver {
  // Type override
  // Type override
  // Type override
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(client, options) {
    super(client, options);
  }

  bindMethods() {
    super.bindMethods();
    this.fetchNextPage = this.fetchNextPage.bind(this);
    this.fetchPreviousPage = this.fetchPreviousPage.bind(this);
  }

  setOptions(options, notifyOptions) {
    super.setOptions({ ...options,
      behavior: infiniteQueryBehavior()
    }, notifyOptions);
  }

  getOptimisticResult(options) {
    options.behavior = infiniteQueryBehavior();
    return super.getOptimisticResult(options);
  }

  fetchNextPage({
    pageParam,
    ...options
  } = {}) {
    return this.fetch({ ...options,
      meta: {
        fetchMore: {
          direction: 'forward',
          pageParam
        }
      }
    });
  }

  fetchPreviousPage({
    pageParam,
    ...options
  } = {}) {
    return this.fetch({ ...options,
      meta: {
        fetchMore: {
          direction: 'backward',
          pageParam
        }
      }
    });
  }

  createResult(query, options) {
    var _state$fetchMeta, _state$fetchMeta$fetc, _state$fetchMeta2, _state$fetchMeta2$fet, _state$data, _state$data2;

    const {
      state
    } = query;
    const result = super.createResult(query, options);
    const {
      isFetching,
      isRefetching
    } = result;
    const isFetchingNextPage = isFetching && ((_state$fetchMeta = state.fetchMeta) == null ? void 0 : (_state$fetchMeta$fetc = _state$fetchMeta.fetchMore) == null ? void 0 : _state$fetchMeta$fetc.direction) === 'forward';
    const isFetchingPreviousPage = isFetching && ((_state$fetchMeta2 = state.fetchMeta) == null ? void 0 : (_state$fetchMeta2$fet = _state$fetchMeta2.fetchMore) == null ? void 0 : _state$fetchMeta2$fet.direction) === 'backward';
    return { ...result,
      fetchNextPage: this.fetchNextPage,
      fetchPreviousPage: this.fetchPreviousPage,
      hasNextPage: hasNextPage(options, (_state$data = state.data) == null ? void 0 : _state$data.pages),
      hasPreviousPage: hasPreviousPage(options, (_state$data2 = state.data) == null ? void 0 : _state$data2.pages),
      isFetchingNextPage,
      isFetchingPreviousPage,
      isRefetching: isRefetching && !isFetchingNextPage && !isFetchingPreviousPage
    };
  }

}

// CLASS
class MutationObserver extends Subscribable {
  constructor(client, options) {
    super();
    this.client = client;
    this.setOptions(options);
    this.bindMethods();
    this.updateResult();
  }

  bindMethods() {
    this.mutate = this.mutate.bind(this);
    this.reset = this.reset.bind(this);
  }

  setOptions(options) {
    const prevOptions = this.options;
    this.options = this.client.defaultMutationOptions(options);

    if (!shallowEqualObjects(prevOptions, this.options)) {
      this.client.getMutationCache().notify({
        type: 'observerOptionsUpdated',
        mutation: this.currentMutation,
        observer: this
      });
    }
  }

  onUnsubscribe() {
    if (!this.listeners.length) {
      var _this$currentMutation;

      (_this$currentMutation = this.currentMutation) == null ? void 0 : _this$currentMutation.removeObserver(this);
    }
  }

  onMutationUpdate(action) {
    this.updateResult(); // Determine which callbacks to trigger

    const notifyOptions = {
      listeners: true
    };

    if (action.type === 'success') {
      notifyOptions.onSuccess = true;
    } else if (action.type === 'error') {
      notifyOptions.onError = true;
    }

    this.notify(notifyOptions);
  }

  getCurrentResult() {
    return this.currentResult;
  }

  reset() {
    this.currentMutation = undefined;
    this.updateResult();
    this.notify({
      listeners: true
    });
  }

  mutate(variables, options) {
    this.mutateOptions = options;

    if (this.currentMutation) {
      this.currentMutation.removeObserver(this);
    }

    this.currentMutation = this.client.getMutationCache().build(this.client, { ...this.options,
      variables: typeof variables !== 'undefined' ? variables : this.options.variables
    });
    this.currentMutation.addObserver(this);
    return this.currentMutation.execute();
  }

  updateResult() {
    const state = this.currentMutation ? this.currentMutation.state : getDefaultState();
    const result = { ...state,
      isLoading: state.status === 'loading',
      isSuccess: state.status === 'success',
      isError: state.status === 'error',
      isIdle: state.status === 'idle',
      mutate: this.mutate,
      reset: this.reset
    };
    this.currentResult = result;
  }

  notify(options) {
    notifyManager.batch(() => {
      // First trigger the mutate callbacks
      if (this.mutateOptions) {
        if (options.onSuccess) {
          var _this$mutateOptions$o, _this$mutateOptions, _this$mutateOptions$o2, _this$mutateOptions2;

          (_this$mutateOptions$o = (_this$mutateOptions = this.mutateOptions).onSuccess) == null ? void 0 : _this$mutateOptions$o.call(_this$mutateOptions, this.currentResult.data, this.currentResult.variables, this.currentResult.context);
          (_this$mutateOptions$o2 = (_this$mutateOptions2 = this.mutateOptions).onSettled) == null ? void 0 : _this$mutateOptions$o2.call(_this$mutateOptions2, this.currentResult.data, null, this.currentResult.variables, this.currentResult.context);
        } else if (options.onError) {
          var _this$mutateOptions$o3, _this$mutateOptions3, _this$mutateOptions$o4, _this$mutateOptions4;

          (_this$mutateOptions$o3 = (_this$mutateOptions3 = this.mutateOptions).onError) == null ? void 0 : _this$mutateOptions$o3.call(_this$mutateOptions3, this.currentResult.error, this.currentResult.variables, this.currentResult.context);
          (_this$mutateOptions$o4 = (_this$mutateOptions4 = this.mutateOptions).onSettled) == null ? void 0 : _this$mutateOptions$o4.call(_this$mutateOptions4, undefined, this.currentResult.error, this.currentResult.variables, this.currentResult.context);
        }
      } // Then trigger the listeners


      if (options.listeners) {
        this.listeners.forEach(listener => {
          listener(this.currentResult);
        });
      }
    });
  }

}

// TYPES
// FUNCTIONS
function dehydrateMutation(mutation) {
  return {
    mutationKey: mutation.options.mutationKey,
    state: mutation.state
  };
} // Most config is not dehydrated but instead meant to configure again when
// consuming the de/rehydrated data, typically with useQuery on the client.
// Sometimes it might make sense to prefetch data on the server and include
// in the html-payload, but not consume it on the initial render.


function dehydrateQuery(query) {
  return {
    state: query.state,
    queryKey: query.queryKey,
    queryHash: query.queryHash
  };
}

function defaultShouldDehydrateMutation(mutation) {
  return mutation.state.isPaused;
}

function defaultShouldDehydrateQuery(query) {
  return query.state.status === 'success';
}

function dehydrate(client, options = {}) {
  const mutations = [];
  const queries = [];

  if (options.dehydrateMutations !== false) {
    const shouldDehydrateMutation = options.shouldDehydrateMutation || defaultShouldDehydrateMutation;
    client.getMutationCache().getAll().forEach(mutation => {
      if (shouldDehydrateMutation(mutation)) {
        mutations.push(dehydrateMutation(mutation));
      }
    });
  }

  if (options.dehydrateQueries !== false) {
    const shouldDehydrateQuery = options.shouldDehydrateQuery || defaultShouldDehydrateQuery;
    client.getQueryCache().getAll().forEach(query => {
      if (shouldDehydrateQuery(query)) {
        queries.push(dehydrateQuery(query));
      }
    });
  }

  return {
    mutations,
    queries
  };
}
function hydrate(client, dehydratedState, options) {
  if (typeof dehydratedState !== 'object' || dehydratedState === null) {
    return;
  }

  const mutationCache = client.getMutationCache();
  const queryCache = client.getQueryCache(); // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition

  const mutations = dehydratedState.mutations || []; // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition

  const queries = dehydratedState.queries || [];
  mutations.forEach(dehydratedMutation => {
    var _options$defaultOptio;

    mutationCache.build(client, { ...(options == null ? void 0 : (_options$defaultOptio = options.defaultOptions) == null ? void 0 : _options$defaultOptio.mutations),
      mutationKey: dehydratedMutation.mutationKey
    }, dehydratedMutation.state);
  });
  queries.forEach(dehydratedQuery => {
    var _options$defaultOptio2;

    const query = queryCache.get(dehydratedQuery.queryHash); // Do not hydrate if an existing query exists with newer data

    if (query) {
      if (query.state.dataUpdatedAt < dehydratedQuery.state.dataUpdatedAt) {
        query.setState(dehydratedQuery.state);
      }

      return;
    } // Restore query


    queryCache.build(client, { ...(options == null ? void 0 : (_options$defaultOptio2 = options.defaultOptions) == null ? void 0 : _options$defaultOptio2.queries),
      queryKey: dehydratedQuery.queryKey,
      queryHash: dehydratedQuery.queryHash
    }, dehydratedQuery.state);
  });
}

const $RAW = Symbol("store-raw"),
      $NODE = Symbol("store-node"),
      $NAME = Symbol("store-name");
function wrap$1(value, name) {
  let p = value[$PROXY];
  if (!p) {
    Object.defineProperty(value, $PROXY, {
      value: p = new Proxy(value, proxyTraps$1)
    });
    if (!Array.isArray(value)) {
      const keys = Object.keys(value),
            desc = Object.getOwnPropertyDescriptors(value);
      for (let i = 0, l = keys.length; i < l; i++) {
        const prop = keys[i];
        if (desc[prop].get) {
          Object.defineProperty(value, prop, {
            enumerable: desc[prop].enumerable,
            get: desc[prop].get.bind(p)
          });
        }
      }
    }
  }
  return p;
}
function isWrappable(obj) {
  let proto;
  return obj != null && typeof obj === "object" && (obj[$PROXY] || !(proto = Object.getPrototypeOf(obj)) || proto === Object.prototype || Array.isArray(obj));
}
function unwrap(item, set = new Set()) {
  let result, unwrapped, v, prop;
  if (result = item != null && item[$RAW]) return result;
  if (!isWrappable(item) || set.has(item)) return item;
  if (Array.isArray(item)) {
    if (Object.isFrozen(item)) item = item.slice(0);else set.add(item);
    for (let i = 0, l = item.length; i < l; i++) {
      v = item[i];
      if ((unwrapped = unwrap(v, set)) !== v) item[i] = unwrapped;
    }
  } else {
    if (Object.isFrozen(item)) item = Object.assign({}, item);else set.add(item);
    const keys = Object.keys(item),
          desc = Object.getOwnPropertyDescriptors(item);
    for (let i = 0, l = keys.length; i < l; i++) {
      prop = keys[i];
      if (desc[prop].get) continue;
      v = item[prop];
      if ((unwrapped = unwrap(v, set)) !== v) item[prop] = unwrapped;
    }
  }
  return item;
}
function getDataNodes(target) {
  let nodes = target[$NODE];
  if (!nodes) Object.defineProperty(target, $NODE, {
    value: nodes = {}
  });
  return nodes;
}
function getDataNode(nodes, property, value) {
  return nodes[property] || (nodes[property] = createDataNode(value));
}
function proxyDescriptor$1(target, property) {
  const desc = Reflect.getOwnPropertyDescriptor(target, property);
  if (!desc || desc.get || !desc.configurable || property === $PROXY || property === $NODE || property === $NAME) return desc;
  delete desc.value;
  delete desc.writable;
  desc.get = () => target[$PROXY][property];
  return desc;
}
function trackSelf(target) {
  if (getListener()) {
    const nodes = getDataNodes(target);
    (nodes._ || (nodes._ = createDataNode()))();
  }
}
function ownKeys(target) {
  trackSelf(target);
  return Reflect.ownKeys(target);
}
function createDataNode(value) {
  const [s, set] = createSignal(value, {
    equals: false,
    internal: true
  });
  s.$ = set;
  return s;
}
const proxyTraps$1 = {
  get(target, property, receiver) {
    if (property === $RAW) return target;
    if (property === $PROXY) return receiver;
    if (property === $TRACK) {
      trackSelf(target);
      return receiver;
    }
    const nodes = getDataNodes(target);
    const tracked = nodes.hasOwnProperty(property);
    let value = tracked ? nodes[property]() : target[property];
    if (property === $NODE || property === "__proto__") return value;
    if (!tracked) {
      const desc = Object.getOwnPropertyDescriptor(target, property);
      if (getListener() && (typeof value !== "function" || target.hasOwnProperty(property)) && !(desc && desc.get)) value = getDataNode(nodes, property, value)();
    }
    return isWrappable(value) ? wrap$1(value) : value;
  },
  has(target, property) {
    if (property === $RAW || property === $PROXY || property === $TRACK || property === $NODE || property === "__proto__") return true;
    this.get(target, property, target);
    return property in target;
  },
  set() {
    return true;
  },
  deleteProperty() {
    return true;
  },
  ownKeys: ownKeys,
  getOwnPropertyDescriptor: proxyDescriptor$1
};
function setProperty(state, property, value, deleting = false) {
  if (!deleting && state[property] === value) return;
  const prev = state[property],
        len = state.length;
  if (value === undefined) delete state[property];else state[property] = value;
  let nodes = getDataNodes(state),
      node;
  if (node = getDataNode(nodes, property, prev)) node.$(() => value);
  if (Array.isArray(state) && state.length !== len) (node = getDataNode(nodes, "length", len)) && node.$(state.length);
  (node = nodes._) && node.$();
}
function mergeStoreNode(state, value) {
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    setProperty(state, key, value[key]);
  }
}
function updateArray(current, next) {
  if (typeof next === "function") next = next(current);
  next = unwrap(next);
  if (Array.isArray(next)) {
    if (current === next) return;
    let i = 0,
        len = next.length;
    for (; i < len; i++) {
      const value = next[i];
      if (current[i] !== value) setProperty(current, i, value);
    }
    setProperty(current, "length", len);
  } else mergeStoreNode(current, next);
}
function updatePath(current, path, traversed = []) {
  let part,
      prev = current;
  if (path.length > 1) {
    part = path.shift();
    const partType = typeof part,
          isArray = Array.isArray(current);
    if (Array.isArray(part)) {
      for (let i = 0; i < part.length; i++) {
        updatePath(current, [part[i]].concat(path), traversed);
      }
      return;
    } else if (isArray && partType === "function") {
      for (let i = 0; i < current.length; i++) {
        if (part(current[i], i)) updatePath(current, [i].concat(path), traversed);
      }
      return;
    } else if (isArray && partType === "object") {
      const {
        from = 0,
        to = current.length - 1,
        by = 1
      } = part;
      for (let i = from; i <= to; i += by) {
        updatePath(current, [i].concat(path), traversed);
      }
      return;
    } else if (path.length > 1) {
      updatePath(current[part], path, [part].concat(traversed));
      return;
    }
    prev = current[part];
    traversed = [part].concat(traversed);
  }
  let value = path[0];
  if (typeof value === "function") {
    value = value(prev, traversed);
    if (value === prev) return;
  }
  if (part === undefined && value == undefined) return;
  value = unwrap(value);
  if (part === undefined || isWrappable(prev) && isWrappable(value) && !Array.isArray(value)) {
    mergeStoreNode(prev, value);
  } else setProperty(current, part, value);
}
function createStore(...[store, options]) {
  const unwrappedStore = unwrap(store || {});
  const isArray = Array.isArray(unwrappedStore);
  const wrappedStore = wrap$1(unwrappedStore);
  function setStore(...args) {
    batch(() => {
      isArray && args.length === 1 ? updateArray(unwrappedStore, args[0]) : updatePath(unwrappedStore, args);
    });
  }
  return [wrappedStore, setStore];
}

const defaultContext = createContext(undefined);
const QueryClientSharingContext = createContext(false);

// If we are given a context, we will use it.
// Otherwise, if contextSharing is on, we share the first and at least one
// instance of the context across the window
// to ensure that if Solid Query is used across
// different bundles or microfrontends they will
// all use the same **instance** of context, regardless
// of module scoping.
function getQueryClientContext(context, contextSharing) {
  if (context) {
    return context;
  }
  if (contextSharing && typeof window !== 'undefined') {
    if (!window.SolidQueryClientContext) {
      window.SolidQueryClientContext = defaultContext;
    }
    return window.SolidQueryClientContext;
  }
  return defaultContext;
}
const useQueryClient = ({
  context
} = {}) => {
  const queryClient = useContext(getQueryClientContext(context, useContext(QueryClientSharingContext)));
  if (!queryClient) {
    throw new Error('No QueryClient set, use QueryClientProvider to set one');
  }
  return queryClient;
};
const QueryClientProvider = props => {
  const mergedProps = mergeProps({
    contextSharing: false
  }, props);
  onMount(() => {
    mergedProps.client.mount();
    if (process.env.NODE_ENV !== 'production' && mergedProps.contextSharing) {
      mergedProps.client.getLogger().error(`The contextSharing option has been deprecated and will be removed in the next major version`);
    }
  });
  onCleanup(() => mergedProps.client.unmount());
  const QueryClientContext = getQueryClientContext(mergedProps.context, mergedProps.contextSharing);
  return createComponent(QueryClientSharingContext.Provider, {
    get value() {
      return !mergedProps.context && mergedProps.contextSharing;
    },
    get children() {
      return createComponent(QueryClientContext.Provider, {
        get value() {
          return mergedProps.client;
        },
        get children() {
          return mergedProps.children;
        }
      });
    }
  });
};

function shouldThrowError(throwError, params) {
  // Allow throwError function to override throwing behavior on a per-error basis
  if (typeof throwError === 'function') {
    return throwError(...params);
  }
  return !!throwError;
}

// Base Query Function that is used to create the query.
function createBaseQuery(options, Observer) {
  const queryClient = createMemo(() => useQueryClient({
    context: options().context
  }));
  const defaultedOptions = queryClient().defaultQueryOptions(options());
  defaultedOptions._optimisticResults = 'optimistic';
  const observer = new Observer(queryClient(), defaultedOptions);
  let resolver;
  let queryResolver;

  // This resource will be used in a Server environment to
  // dehydrate the queryClient when the query is
  // pre fetched on the server. It will always be undefined
  // if an observer is mounted on client.
  const [queryResource] = createResource(() => {
    return new Promise(resolve => {
      if (!isServer$1) {
        resolve(undefined);
      }
      queryResolver = resolve;
    });
  });

  // If queryResource is defined,
  // This means that the query was fetched on the server!
  // We need to hydrate the queryClient with the query from
  // the server before we set up the observer and its results.
  if (queryResource()) {
    hydrate(queryClient(), queryResource());
  }
  const [state, setState] = createStore(observer.getOptimisticResult(defaultedOptions));
  const [dataResource, {
    mutate,
    refetch
  }] = createResource(() => {
    return new Promise(resolve => {
      if (!(state.isFetching && state.isLoading)) {
        resolve(unwrap(state.data));
      }
      // We only resolve the data resource
      // when the query observer finds a result
      // This function will be called inside the observer
      // subscription function.
      resolver = resolve;
    });
  });
  const unsubscribe = observer.subscribe(result => {
    notifyManager.batchCalls(() => {
      const unwrappedResult = unwrap(result);
      setState(unwrappedResult);
      if (isServer$1) {
        if (!(result.isFetching && result.isLoading)) {
          const dehydratedClient = dehydrate(queryClient());
          queryResolver?.(dehydratedClient);
          resolver?.(unwrap(unwrappedResult.data));
        }
      } else {
        if (!(result.isFetching && result.isLoading)) {
          resolver?.(unwrap(unwrappedResult.data));
        }
        if (result.isFetching) {
          // Data resource can only be mutated on the client
          // Data is mutated only when a new query is mounted on the
          // same observer (For example, when a query key changes).
          // And reactivity is not allowed on the server.
          // https://www.solidjs.com/guides/server#ssr-caveats
          mutate(() => unwrappedResult.data);
          refetch();
        }
      }
    })();
  });
  onCleanup(() => unsubscribe());
  onMount(() => {
    observer.setOptions(defaultedOptions, {
      listeners: false
    });
  });
  createComputed(() => {
    observer.setOptions(queryClient().defaultQueryOptions(options()));
  });
  createComputed(on(() => state.status, () => {
    if (state.isError && !state.isFetching && shouldThrowError(observer.options.throwErrors, [state.error, observer.getCurrentQuery()])) {
      throw state.error;
    }
  }));
  const handler = {
    get(target, prop) {
      if (prop === 'data') {
        return dataResource();
      }
      return Reflect.get(target, prop);
    }
  };
  return new Proxy(state, handler);
}

function createQuery(options) {
  return createBaseQuery(createMemo(() => options()), QueryObserver);
}

function createInfiniteQuery(options) {
  return createBaseQuery(createMemo(() => options()), InfiniteQueryObserver);
}

// HOOK
function createMutation(options) {
  const queryClient = useQueryClient({
    context: options().context
  });
  const observer = new MutationObserver(queryClient, options());
  const mutate = (variables, mutateOptions) => {
    observer.mutate(variables, mutateOptions).catch(noop);
  };
  const [state, setState] = createStore({
    ...observer.getCurrentResult(),
    mutate,
    mutateAsync: observer.getCurrentResult().mutate
  });
  createComputed(() => {
    observer.setOptions(options());
  });
  createComputed(on(() => state.status, () => {
    if (state.isError && shouldThrowError(observer.options.throwErrors, [state.error])) {
      throw state.error;
    }
  }));
  const unsubscribe = observer.subscribe(result => {
    setState({
      ...result,
      mutate,
      mutateAsync: result.mutate
    });
  });
  onCleanup(unsubscribe);
  return state;
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
function noop() {}

/**
 * To allow easy interactions with groups of related queries, such as
 * invalidating all queries of a router, we use an array as the path when
 * storing in tanstack query. This function converts from the `.` separated
 * path passed around internally by both the legacy and proxy implementation.
 * https://github.com/trpc/trpc/issues/2611
 */
function getArrayQueryKey(queryKey) {
  const queryKeyArrayed = Array.isArray(queryKey) ? queryKey : [queryKey];
  const [path, ...input] = queryKeyArrayed;
  const arrayPath = typeof path !== 'string' || path === '' ? [] : path.split('.');
  return [arrayPath, ...input];
}

function getClientArgs(pathAndInput, opts) {
  const [path, input] = pathAndInput;
  return [path, input, opts?.trpc];
}
/**
 * Create strongly typed react hooks
 * @internal
 */
function createHooksInternal(config) {
  // const mutationSuccessOverride: UseMutationOverride["onSuccess"] =
  //   config?.unstable_overrides?.useMutation?.onSuccess ??
  //   ((options) => options.originalFn());

  const Context = config?.context ?? TRPCContext;
  const SolidQueryContext = config?.solidQueryContext;
  const createClient = opts => {
    return createTRPCClient(opts);
  };
  const TRPCProvider = props => {
    const {
      abortOnUnmount = false,
      client,
      queryClient
    } = props;
    return createComponent(Context.Provider, {
      value: {
        abortOnUnmount,
        queryClient,
        client,
        fetchQuery: (pathAndInput, opts) => {
          return queryClient.fetchQuery(getArrayQueryKey(pathAndInput), () => client.query(...getClientArgs(pathAndInput, opts)), opts);
        },
        fetchInfiniteQuery: (pathAndInput, opts) => {
          return queryClient.fetchInfiniteQuery(getArrayQueryKey(pathAndInput), ({
            pageParam
          }) => {
            const [path, input] = pathAndInput;
            const actualInput = {
              ...input,
              cursor: pageParam
            };
            return client.query(...getClientArgs([path, actualInput], opts));
          }, opts);
        },
        prefetchQuery: (pathAndInput, opts) => {
          return queryClient.prefetchQuery(getArrayQueryKey(pathAndInput), () => client.query(...getClientArgs(pathAndInput, opts)), opts);
        },
        prefetchInfiniteQuery: (pathAndInput, opts) => {
          return queryClient.prefetchInfiniteQuery(getArrayQueryKey(pathAndInput), ({
            pageParam
          }) => {
            const [path, input] = pathAndInput;
            const actualInput = {
              ...input,
              cursor: pageParam
            };
            return client.query(...getClientArgs([path, actualInput], opts));
          }, opts);
        },
        invalidateQueries: (...args) => {
          const [queryKey, ...rest] = args;
          return queryClient.invalidateQueries(getArrayQueryKey(queryKey), ...rest);
        },
        refetchQueries: (...args) => {
          const [queryKey, ...rest] = args;
          return queryClient.refetchQueries(getArrayQueryKey(queryKey), ...rest);
        },
        cancelQuery: pathAndInput => {
          return queryClient.cancelQueries(getArrayQueryKey(pathAndInput));
        },
        setQueryData: (...args) => {
          const [queryKey, ...rest] = args;
          return queryClient.setQueryData(getArrayQueryKey(queryKey), ...rest);
        },
        getQueryData: (...args) => {
          const [queryKey, ...rest] = args;
          return queryClient.getQueryData(getArrayQueryKey(queryKey), ...rest);
        },
        setInfiniteQueryData: (...args) => {
          const [queryKey, ...rest] = args;
          return queryClient.setQueryData(getArrayQueryKey(queryKey), ...rest);
        },
        getInfiniteQueryData: (...args) => {
          const [queryKey, ...rest] = args;
          return queryClient.getQueryData(getArrayQueryKey(queryKey), ...rest);
        }
      },
      get children() {
        return createComponent(QueryClientProvider, mergeProps$1({
          client: queryClient
        }, () => props.queryClientOpts ?? {}, {
          get children() {
            return props.children;
          }
        }));
      }
    });
  };
  function useContext$1() {
    return useContext(Context);
  }
  function useQuery(pathAndInput, opts) {
    const ctx = useContext$1();
    const withCtxOpts = () => mergeProps(opts?.(), {
      context: SolidQueryContext
    });
    if (typeof window === "undefined" && opts?.().enabled !== false && !ctx.queryClient.getQueryCache().find(getArrayQueryKey(pathAndInput()))) {
      void ctx.prefetchQuery(pathAndInput(), opts?.());
    }
    return createQuery(() => ({
      queryKey: getArrayQueryKey(pathAndInput()),
      queryFn: () => {
        return ctx.client.query(...getClientArgs(pathAndInput(), opts?.()));
      },
      ...withCtxOpts?.()
    }));
  }
  function useMutation(path, opts) {
    const ctx = useContext$1();
    const withCtxOpts = () => mergeProps(opts?.(), {
      context: SolidQueryContext
    });
    return createMutation(() => ({
      mutationFn: input => {
        const actualPath = Array.isArray(path) ? path[0] : path;
        return ctx.client.mutation(...getClientArgs([actualPath, input], opts));
      },
      ...withCtxOpts()
    }));
  }

  /* istanbul ignore next */
  /**
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
   *  **Experimental.** API might change without major version bump
   * ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠
   */
  function useSubscription(pathAndInput, opts) {
    const ctx = useContext$1();
    return createEffect(() => {
      if (!(opts.enabled ?? true)) {
        return;
      }
      // noop
      (() => {
        return hashQueryKey(pathAndInput());
      })();
      let isStopped = false;
      const subscription = ctx.client.subscription(pathAndInput()[0], pathAndInput()[1] ?? undefined, {
        onStarted: () => {
          if (!isStopped) {
            opts?.onStarted?.();
          }
        },
        onData: data => {
          if (!isStopped) {
            opts?.onData(data);
          }
        },
        onError: err => {
          if (!isStopped) {
            opts?.onError?.(err);
          }
        }
      });
      onCleanup(() => {
        isStopped = true;
        subscription.unsubscribe();
      });
    });
  }
  function useInfiniteQuery(pathAndInput, opts) {
    const ctx = useContext$1();
    const withCtxOpts = () => mergeProps(opts?.(), {
      context: SolidQueryContext
    });
    if (typeof window === "undefined" && opts?.().enabled !== false && !ctx.queryClient.getQueryCache().find(getArrayQueryKey(pathAndInput()))) {
      void ctx.prefetchInfiniteQuery(pathAndInput, opts);
    }
    return createInfiniteQuery(() => ({
      queryKey: getArrayQueryKey(pathAndInput()),
      queryFn: queryFunctionContext => {
        const actualInput = {
          ...(pathAndInput()[1] ?? {}),
          cursor: queryFunctionContext.pageParam
        };
        return ctx.client.query(...getClientArgs([pathAndInput()[0], actualInput], opts?.()));
      },
      ...withCtxOpts()
    }));
  }
  return {
    Provider: TRPCProvider,
    createClient,
    useContext: useContext$1,
    useQuery,
    useMutation,
    useSubscription,
    useInfiniteQuery
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @internal
 */
function createHooksInternalProxy(trpc) {
  return createFlatProxy(key => {
    if (key === "useContext") {
      return () => {
        const context = trpc.useContext();
        // create a stable reference of the utils context
        return createSolidQueryUtilsProxy(context);
      };
    }
    if (key in trpc) {
      return trpc[key];
    }
    return createSolidProxyDecoration(key, trpc);
  });
}
function createTRPCSolid(opts) {
  const hooks = createHooksInternal(opts);
  const proxy = createHooksInternalProxy(hooks);
  return proxy;
}

// interop:

/**
 * @deprecated use `createTRPCSolid` instead
 */
function createSolidQueryHooks(opts) {
  const trpc = createHooksInternal(opts);
  const proxy = createHooksInternalProxy(trpc);
  return {
    ...trpc,
    proxy
  };
}

export { TRPCClientError, createSolidQueryHooks, createTRPCClient, createTRPCClientProxy, createTRPCProxyClient, createTRPCSolid, createWSClient, getFetch, httpBatchLink, httpLink, loggerLink, splitLink, wsLink };
