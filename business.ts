import needle, { NeedleResponse } from 'needle'
import { Level } from 'level'
import * as qs from 'qs'
import puppeteer, {Browser} from 'puppeteer';

const db = new Level('db', {valueEncoding: 'json'})

const SERVER_SSO_URL = process.env.SERVER_SSO_URL

function generateRandomString(length: number): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }

interface TaskCheckAndLogin {
    user: string
    password: string
    accesstoken: string
    refreshtoken: string
    email: string
    headers: any
    cookies: any | undefined
}



export class Business {

    paddingTask: TaskCheckAndLogin[] = []
    finishedTask: TaskCheckAndLogin[] = []

    constructor() {
        this.tickTaskRunner()
    }

    tickTaskRunner = async () => {

        if (this.paddingTask.length > 0) {
            let task = this.paddingTask[0]
            let {user, password, accesstoken, refreshtoken, email, headers} = task

            let finishedTask = this.finishedTask.filter(item => item.user == user)
            if (finishedTask.length > 0) {
                //already loged
                //TODO FIXME check cookie tiemout
            } else {

                // let pwd: string | undefined = undefined
                // try {
                //     pwd = await db.get(`password_${user}`)
                // } catch (error) {
                //     console.error(error)
                // }
                
                
                // if (pwd == undefined) {
                //     pwd = generateRandomString(12)
                //     await db.put(`password_${user}`, pwd)
        
                //     await this.createAccount(user, pwd, email)
                //     await this.approveCreate('root', process.env.ROOT_PASSWORD as string, user)
        
                // }
        
                // let cookies = await this.login(user, pwd, headers)
                // task.cookies = cookies

                
                //////////////////////////////////////
                // check login
                const stateLogin = await this.testLogin(user, password, headers)

                // if error 
                    // create account
                    // approve create
                if (stateLogin.state == 'succeed') {
                    task.cookies = stateLogin.cookies
                } else {
                    await this.createAccount(user, password, email)
                    await this.approveCreate('root', process.env.ROOT_PASSWORD as string, user)
                    let cookies = await this.login(user, password, headers)
                    task.cookies = cookies
                }


            }

            this.finishedTask.push(task)
            this.paddingTask.pop()
        } else {
            setTimeout(this.tickTaskRunner, 500)
        }

    }

    checkAndLogin = (user: string, password: string, accesstoken: string, refreshtoken: string, email: string, headers: any) => new Promise<any[]>(async (resolve, reject) => {
        this.paddingTask.push({
            user,
            password,
            accesstoken,
            refreshtoken,
            email,
            headers,
            cookies: undefined
        })

        let checker = setInterval(() => {
            let finishedTask = this.finishedTask.filter(item => item.user == user)
            if (finishedTask.length > 0) {
                clearInterval(checker)
                resolve(finishedTask[0].cookies)
            }
        }, 200)

    })

    login = (user: string, pwd: string, headers: any) => new Promise(async (resolve, reject) => {
        console.log('start login')
        console.log('user', user)
        console.log('pwd', pwd)
        console.log('headers', headers)
        headers.host = process.env.SERVER_PROXY_DOMAIN
        let browser = await puppeteer.connect({
            browserWSEndpoint: 'ws://127.0.0.1:3000',
        })
        // const browser = await puppeteer.launch({
        //     headless: 'new'
        // });
        let page = await browser.newPage()
        await page.setExtraHTTPHeaders({
            'user-agent': headers['user-agent']
        })

        console.log('created page')
        await page.goto(`${process.env.SERVER_PROXY_URL}/users/sign_in`)
        console.log('goto')
        await page.type('#user_login', user);
        await page.type('#user_password', pwd);
        console.log('input')
        await page.waitForSelector('.btn-confirm');
        await page.click('.btn-confirm');
        
        const currentCookies = await page.cookies();
        console.log('currentCookies', currentCookies);

        await page.close()
        await browser.close()
        resolve(currentCookies)

    })

    testLogin = (user: string, pwd: string, headers: any) => new Promise<any>(async (resolve, reject) => {
        console.log('start testLogin')
        console.log('user', user)
        console.log('pwd', pwd)
        console.log('headers', headers)

        headers.host = process.env.SERVER_PROXY_DOMAIN
        let browser = await puppeteer.connect({
            browserWSEndpoint: 'ws://127.0.0.1:3000',
        })
        // const browser = await puppeteer.launch({
        //     headless: 'new'
        // });
        let page = await browser.newPage()
        await page.setExtraHTTPHeaders({
            'user-agent': headers['user-agent']
        })

        console.log('created page')
        await page.goto(`${process.env.SERVER_PROXY_URL}/users/sign_in`)
        console.log('goto')
        await page.type('#user_login', user);
        await page.type('#user_password', pwd);
        console.log('input')
        await page.waitForSelector('.btn-confirm');


        const [responseSubmit] = await Promise.all([
            page.waitForNavigation(),
            page.click('.btn-confirm')
        ]);
        console.log('responseSubmit:', responseSubmit)

        
        const alertMsg = await page.waitForSelector('.gl-alert-body', {
            timeout: 1000
        })
        if (alertMsg == null) {
            const currentCookies = await page.cookies();
            console.log('currentCookies', currentCookies);

            await page.close()
            await browser.close()
            resolve({
                cookies: currentCookies,
                state: 'succeed'
            })
        } else {

            const alertContent = await page.evaluate(alertMsg => alertMsg?.textContent, alertMsg);
            console.log('alertContent', alertContent)

            if (alertContent?.trim() == "Invalid login or password.") {
                resolve({
                    state: 'Invalid login or password.',
                })
            } else {
                const currentCookies = await page.cookies();
                console.log('currentCookies', currentCookies);
    
                await page.close()
                await browser.close()
                resolve({
                    cookies: currentCookies,
                    state: 'succeed'
                })
            }
        }

    })

    createAccount = (user: string, pwd: string, email: string) => new Promise<void>(async (resolve, reject) => {
        try {
            if (email == undefined || email == "") {
                email = `${user}@${process.env.SERVER_PROXY_DOMAIN}`
            }
            console.log('start createAccount')
            console.log('user', user)
            console.log('pwd', pwd)
            console.log('email', email)
            let browser = await puppeteer.connect({
                browserWSEndpoint: 'ws://127.0.0.1:3000',
            })
            // const browser = await puppeteer.launch({
            //     headless: 'new'
            // });
            console.log('created browser')
            let page = await browser.newPage()
            await page.goto(`${process.env.SERVER_PROXY_URL}/users/sign_up`)
            console.log('goto')
            await page.type('#new_user_first_name', 'fname');
            await page.type('#new_user_last_name', 'lname');
            await page.type('#new_user_username', user);
            await page.type('#new_user_email', email);
            await page.type('#new_user_password', pwd);
            console.log('input')
            await page.waitForSelector('[type="submit"]');


            const [responseSubmit] = await Promise.all([
                page.waitForNavigation(),
                page.click('[type="submit"]')
            ]);
            console.log('responseSubmit', responseSubmit)
            console.log('submit')

            let htmlContent = await page.content()
            console.log(await page.title())
            console.log('htmlContent', htmlContent)

            await page.close()
            await browser.close()
            resolve()

        } catch (error) {
            console.log(error)
        }
    })

    approveCreate = (user: string, pwd: string, name: string) => new Promise<void>(async (resolve, reject) => {
        
        try {
            console.log('start approveCreate')
            let browser = await puppeteer.connect({
                browserWSEndpoint: 'ws://127.0.0.1:3000',
            })
            // const browser = await puppeteer.launch({
            //     headless: 'new'
            // });
            console.log('created browser')
            let page = await browser.newPage()
            console.log('created page')
            await page.goto(`${process.env.SERVER_PROXY_URL}/users/sign_in`)
            console.log('goto')
            await page.type('#user_login', user);
            await page.type('#user_password', pwd);
            console.log('input')
            await page.waitForSelector('.btn-confirm');
            await page.click('.btn-confirm');
            console.log('submit')
            console.log(await page.title())

            await page.goto(`${process.env.SERVER_PROXY_URL}/admin/users?filter=blocked_pending_approval`)

            console.log(await page.title())

            try {

                const close = await page.waitForSelector('[aria-label="Close"]', { timeout: 5000 })
                // close?.click()
                // const [closeClickSubmit] = await Promise.all([
                //     page.waitForNavigation({ timeout: 1000 }),
                //     page.click('[aria-label="Close"]')
                // ]);

                // console.log('close click', closeClickSubmit)
                if (close == null) {
                    console.log('no close')
                } else {
                    const closeContent = await page.evaluate(close => close?.outerHTML, close);
                    console.log('closeContent:', closeContent)

                    await close.click()
                    console.log('close click')

                    await page.waitForSelector('[aria-label="Close"]', { hidden: true });
                    // const closeAgain = await page.waitForSelector('[aria-label="Close"]', { timeout: 100 })
                    
                    // if (closeAgain == null) {
                    //     console.log('message hide')
                    // } else {
                    //     throw new Error("message showing");
                        
                    // }
                }
                
            } catch (error) {
                console.log('close error')
                console.log(error)
            }
            
            
            let btnBox = await page.waitForSelector(`[data-qa-username="${name}"]`)
            let btnEnum = await btnBox?.waitForSelector('[data-testid="base-dropdown-toggle"]')
            // const [btnEnumSubmit] = await Promise.all([
            //     page.waitForNavigation({ timeout: 1000 }),
            //     // page.click('[data-testid="base-dropdown-toggle"]')
            //     btnEnum?.click()
            // ]);

            if (btnEnum == null) {
                console.log('no btnEnum')
            } else {
                await btnEnum.click()
                const btnEnumContent = await page.evaluate(btnEnum => btnEnum?.outerHTML, btnEnum);
                console.log('btnEnumContent:', btnEnumContent)
            }

            // await btnEnum?.click()
            // console.log('click 1', btnEnumSubmit)
            console.log('click 1')
            

            const elementContent = await page.evaluate(btnBox => btnBox?.outerHTML, btnBox);
            console.log('btnBox:', elementContent)
            
            let approveLayout = await btnBox?.$('[data-testid="approve"]')

            const approveLayoutContent = await page.evaluate(approveLayout => approveLayout?.outerHTML, approveLayout);
            console.log('approveLayout:', approveLayoutContent)

            let btn = await approveLayout?.waitForSelector('[type="button"]')

            const btnContent = await page.evaluate(btn => btn?.outerHTML, btn);
            console.log('btnContent:', btnContent)


            // const [click2Submit] = await Promise.all([
            //     page.waitForNavigation({ timeout: 1000 }),
            //     btn?.click()
            // ]);
            await btn?.click()
            console.log('click 2')



            await page.waitForSelector('[data-testid="approve-user-confirm-button"]')
            // const [click3Submit] = await Promise.all([
            //     page.waitForNavigation({ timeout: 1000 }),
            //     page.click('[data-testid="approve-user-confirm-button"]')
            // ]);
            await page.click('[data-testid="approve-user-confirm-button"]')
            console.log('click 3')
            
            await page.close()
            await browser.close()
            resolve()
        } catch (error) {
            console.log(error)

        }

    })

    async getAccountAuthorization(user: string) {
        let pwd = ''
        try {
            pwd = await db.get(`password_${user}`)
        } catch (error) {
            console.error(error)
        }
        return {
            user,
            password: pwd
        }
    }

    doTest = async () => {

        // await business.createAccount('t5', 'GUNnmd123!!!', 't5@edge-dev.xyz')
        // await business.approveCreate('root', 'n3EVi0j7IkKMGPXr43lnnZHiXYTe1Ygh3FN4DEsLWON4Yg4wliWfgoZEOqO0wDZ1', 't5')
        const resp = await this.testLogin('root', 'ALxtsf8UI38QjC6c5ufNKXzbFdEsi3Z8oHg0cfJf5CikutHSjj5Vnnol72psTOxT', {
            'user-agent': ''
        })
        console.log('resp', resp)
    }
}


export const business = new Business()
// business.doTest()
