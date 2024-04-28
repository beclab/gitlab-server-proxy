import httpProxy from 'http-proxy';
import zlib from 'zlib'

import Koa from 'koa'
import Router from '@koa/router'

import { business } from './business';

const SERVER_PROXY_URL = process.env.SERVER_PROXY_URL
const SERVER_PROXY_DOMAIN = process.env.SERVER_PROXY_DOMAIN

const SERVER_THIS_DOMAIN = process.env.SERVER_THIS_DOMAIN

const sleep = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

const proxy = httpProxy.createProxyServer(
    {
        target: SERVER_PROXY_URL,
        headers: {
            host: SERVER_PROXY_DOMAIN as string,
        },
        selfHandleResponse: true
    }
).listen(8000);

proxy.on('proxyReq', (proxyReq, req, res, options) => {
    
    console.group('proxyReq')
    console.group('header')
    console.log(proxyReq.getHeaders())
    console.groupEnd()

    console.group('header req')
    console.log(req.headers)
    console.groupEnd()

    console.group('options')
    console.log(options.headers)
    console.groupEnd()

    req.headers.host = SERVER_PROXY_URL
    
    console.group('request')
    // let data = proxyReq.req.read()
    // console.log(data)
    console.groupEnd()

    console.groupEnd()
})

proxy.on('proxyRes', async (proxyRes, req, res) => {
    console.group('proxyRes')
    console.log(proxyRes.statusCode)
    console.log(proxyRes.statusMessage)
    console.group('header')
    console.log(proxyRes.headers)
    console.groupEnd()
    console.group('req header')
    console.log(req.headers)
    console.groupEnd()

    if (req.headers['x-gitlab-cp-call'] != undefined) {
        res.setHeader('x-gitlab-cp-call', req.headers['x-gitlab-cp-call'])
    }

    let newHeader: {
        location: string | undefined
    } = {
        // 'content-encoding': 'none'
        location: ''
    }
    //reset local
    if (proxyRes.statusCode == 302) {
        newHeader.location = proxyRes.headers.location?.replace(SERVER_PROXY_DOMAIN as string, SERVER_THIS_DOMAIN as string);
    }
    
    res.writeHead(proxyRes.statusCode ? proxyRes.statusCode : 404, proxyRes.statusMessage, Object.assign({}, proxyRes.headers, newHeader))

    let dataReady = false
    let body: any[] = [];
    
    
    
    proxyRes.on('data', function (chunk: any) {
        body.push(chunk);
    });
    proxyRes.on('end', function () {

        // zlib.inflate(Buffer.concat(body), (error, buf) => {
        //     console.log('error', error)
        //     console.log('buf', buf)

        //     let bodyStr = buf.toString('utf-8')
        //     console.group('request')
        //     console.log(bodyStr)
        //     console.log(body)
        //     console.groupEnd()
        // });

        
        // res.write("");
        res.write(Buffer.concat(body))
        res.end()
        // res.end("my response to cli");

        console.log('proxyRes on end')
        dataReady = true
    });

    

    while (!dataReady) {
        await sleep(100)
    }
    
    // res.write()
    // res.
    // res.write(0)
    // res.end("my response to cli")

    console.groupEnd()
})

const app = new Koa();
const router = new Router();

router.get('/sp/getAccountAuthorization', async(ctx, next) => {
    console.group('in 8000 getAccountAuthorization')
    console.log('headers', ctx.headers)
    let reqInHeaders = ctx.headers
    let user = reqInHeaders['x-bfl-user'] as string
    let authorization = await business.getAccountAuthorization(user)
    ctx.body = authorization
})

router.get('/', async (ctx, next) => {
    console.group('in 8000')
    console.log('headers', ctx.headers)
    let reqInHeaders = ctx.headers
    let user = reqInHeaders['x-bfl-user'] as string
    let accesstoken = reqInHeaders['remote-accesstoken'] as string
    let refreshtoken = reqInHeaders['remote-refreshtoken'] as string
    let email = reqInHeaders['remote-email'] as string
    let password = reqInHeaders['x-gitlab-password'] as string

    if (user != undefined && accesstoken != undefined && refreshtoken != undefined) {
        let cookies = await business.checkAndLogin(user, password, accesstoken, refreshtoken, email, reqInHeaders)

        let cookieStr = ''
        for (const c of cookies) {
            // cookieStr += `
            //     ${c.name}=${c.value};
            //     ${c.expires != -1 ? 'Expires=' + new Date(c.expires * 1000).toUTCString() + ';'  : ''}
            //     HttpOnly=${c.httpOnly};
            //     Path=${c.path};
            //     Domain=${reqInHeaders.host};
            //     Secure=${c.secure};
            //     Session=${c.session};
            //     SameSite=${c.sameSite};
            //     SameParty=${c.sameParty};
            //     SourceScheme=${c.sourceScheme};
            //     SourcePort=${c.sourcePort};,
            //     `
            ctx.cookies.set(c.name, c.value, {
                expires: c.expires == -1 ? undefined : new Date(c.expires * 1000),
                path: c.path,
                domain: reqInHeaders.host,
                // secure: c.secure,
                // secureProxy: c.secureProxy,
                httpOnly: c.httpOnly,
                sameSite: c.sameSite,

            })
        }

        
        ctx.response.headers['set-cookie'] = cookieStr
        ctx.redirect('/')
    }
    console.groupEnd()
})
app
    .use(router.routes())
    .use(router.allowedMethods());
app.listen(4000)
