import {
  Button, Chip, Divider, Dropdown,
  DropdownItem, DropdownMenu, DropdownTrigger, Input, Link,
  Listbox,
  ListboxItem,
  Modal, ModalBody, ModalContent, ModalFooter, ModalHeader,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem, NavbarMenu, NavbarMenuItem, NavbarMenuToggle, Spacer
} from "@heroui/react";
import useDarkMode from "use-dark-mode";
import { TbHome, TbMap, TbMoon, TbSun, TbUpload } from "react-icons/tb";
import { Outlet, useNavigate } from "react-router-dom";
import { LoadingContext } from "../contexts/loading";
import { FormEvent, useEffect, useState } from "react";
import { MapToken, MapTokenContext, MapType } from "../contexts/map_token.tsx";
import axios from "axios";
import { Response } from "../models/gallery.ts";
import { HiOutlineTranslate } from "react-icons/hi";
import { useTranslation } from "react-i18next";
import moment from "moment";
import gradLeft from '../assets/gradients/left.png';
import gradRight from '../assets/gradients/right.png';
import { useAdminSession } from "../contexts/admin_session_context.ts";

const routes = [
  { route: '/', text: 'sidebar.home', icon: <TbHome size={22}/> },
  { route: '/map', text: 'sidebar.map', icon: <TbMap size={22}/> },
  // 上传页仍由服务端管理员会话保护。
  {route: '/upload', text: 'sidebar.upload', icon: <TbUpload size={22}/>}
]

export default function Root() {
  const darkMode = useDarkMode(false, {
    classNameDark: 'dark',
    classNameLight: 'light',
    element: document.documentElement,
  });

  useEffect(() => {
    axios.get<Response<string>>(`https://api.gallery.boar.ac.cn/geo/ip`).then(async (res) => {
      if (res.data.payload === 'CN') {
        // mapbox
        axios.get<Response<string>>('https://api.gallery.boar.ac.cn/mapbox/token').then((res) => {
          setToken({ type: MapType.MapBox, token: res.data.payload })
        })
      } else {
        // apple map
        axios.get<Response<string>>('https://api.gallery.boar.ac.cn/mapkit-js/token').then((res) => {
          setToken({ type: MapType.Apple, token: res.data.payload })
        })
      }
    })
  }, [])

  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState<MapToken>()
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { t, i18n } = useTranslation()
  const navigate = useNavigate();
  const { status, username, login, logout } = useAdminSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  // 登录后才在桌面和移动导航中提供上传入口；服务端仍会独立验证权限。
  const visibleRoutes = routes.filter(route => route.route !== '/upload' || status === 'authenticated');

  function authErrorMessage(cause: unknown): string {
    if (axios.isAxiosError(cause)) {
      return cause.response?.status === 401 ? t('auth.error.invalid') :
        cause.response ? t('auth.error.server', { status: cause.response.status }) : t('auth.error.network');
    }
    return t('auth.error.network');
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authBusy) return;
    setAuthError("");
    setAuthBusy(true);
    try {
      await login(loginName, loginPassword);
      setLoginName("");
      setLoginPassword("");
      setLoginOpen(false);
    } catch (cause) {
      setAuthError(authErrorMessage(cause));
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (authBusy) return;
    setAuthError("");
    setAuthBusy(true);
    try {
      await logout();
      if (window.location.pathname === '/upload') navigate('/');
    } catch (cause) {
      setAuthError(authErrorMessage(cause));
    } finally {
      setAuthBusy(false);
    }
  }

  return (
    <MapTokenContext.Provider value={{ token, setToken }}>
      <LoadingContext.Provider value={{ loading, setLoading }}>
        <div aria-hidden="true"
             className="fixed hidden dark:md:block dark:opacity-70 -bottom-[40%] -left-[20%] pointer-events-none">
          <img src={gradLeft}
               className="relative opacity-0 shadow-black/5 data-[loaded=true]:opacity-100 shadow-none transition-transform-opacity motion-reduce:transition-none !duration-300 rounded-large"
               alt="left background" data-loaded="true"/>
        </div>

        <div aria-hidden="true"
             className="fixed hidden dark:md:block dark:opacity-70 -top-[80%] -right-[60%] 2xl:-top-[60%] 2xl:-right-[45%] rotate-12 pointer-events-none">
          <img src={gradRight}
               className="relative opacity-0 shadow-black/5 data-[loaded=true]:opacity-100 shadow-none transition-transform-opacity motion-reduce:transition-none !duration-300 rounded-large"
               alt="right background" data-loaded="true"/>
        </div>

        <main
          className={`${darkMode.value ? 'dark' : ''} text-foreground scrollbar-hide`}>
          <Navbar onMenuOpenChange={setIsMenuOpen} isMenuOpen={isMenuOpen}>
            <NavbarBrand>
              <Link className="font-bold text-inherit text-logo" href='/'>Zw Gallery</Link>
              {status === 'authenticated' && (username === 'aoi' || username === 'amadou') &&
                <Chip size="sm" variant="flat" className="ml-2">{username}</Chip>}
            </NavbarBrand>
            <NavbarContent justify="end">
              <NavbarItem className={`${isMenuOpen ? '' : 'hidden'} sm:flex`}>
                <Dropdown>
                  <DropdownTrigger>
                    <Button isIconOnly variant="light">
                      <HiOutlineTranslate size={20}/>
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="Single selection example"
                    variant="flat"
                    disallowEmptySelection
                    selectionMode="single"
                    selectedKeys={[i18n.language]}
                    onSelectionChange={(l) => i18n.changeLanguage((l as Set<string>).values().next().value)}
                  >
                    <DropdownItem key="zh-CN">简体中文</DropdownItem>
                    <DropdownItem key="en">English</DropdownItem>
                    <DropdownItem key="ja">日本語</DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </NavbarItem>
              <NavbarItem className={`${isMenuOpen ? '' : 'hidden'} sm:flex`}>
                <Button isIconOnly variant="flat" onPress={darkMode.toggle}>
                  {
                    darkMode.value ?
                      <TbSun size={24}/>
                      :
                      <TbMoon size={20}/>
                  }
                </Button>
              </NavbarItem>
              <NavbarItem>
                <Button size="sm" variant="flat" isLoading={authBusy}
                        isDisabled={status === 'loading'}
                        onPress={status === 'authenticated' ? signOut : () => setLoginOpen(true)}>
                  {status === 'authenticated' ? t('auth.logout') : t('auth.login')}
                </Button>
              </NavbarItem>
              <NavbarMenuToggle className="sm:hidden ml-2"/>
            </NavbarContent>

            <NavbarMenu>
              {
                visibleRoutes.map((r) => (
                  <NavbarMenuItem key={r.route}>
                    <Link
                      className="w-full pt-3 font-bold"
                      size="lg"
                      onPress={() => {
                        navigate(r.route)
                        setIsMenuOpen(false)
                      }}
                      color='foreground'
                    >
                      {r.icon}
                      <Spacer x={2}/>
                      {t(r.text)}
                    </Link>
                  </NavbarMenuItem>
                ))
              }

              <Divider className='mt-4 mb-4'/>

              <div className='text-tiny text-default-400'>
                <p>{t('copyright.reserved', { year: moment().year() })}</p>
              </div>
            </NavbarMenu>
          </Navbar>

          <Modal isOpen={loginOpen} onOpenChange={(open) => {
            setLoginOpen(open);
            if (!open) {
              setLoginPassword("");
              setAuthError("");
            }
          }} placement="center">
            <ModalContent>
              <form onSubmit={submitLogin}>
                <ModalHeader>{t('auth.login')}</ModalHeader>
                <ModalBody>
                  <Input label={t('auth.username')} value={loginName} onValueChange={setLoginName}
                         autoComplete="username" maxLength={100} isRequired/>
                  <Input label={t('auth.password')} type="password" value={loginPassword}
                         onValueChange={setLoginPassword} autoComplete="current-password" isRequired/>
                  {authError && <p className="text-danger text-sm" role="alert">{authError}</p>}
                </ModalBody>
                <ModalFooter>
                  <Button color="primary" type="submit" isLoading={authBusy}>{t('auth.login')}</Button>
                </ModalFooter>
              </form>
            </ModalContent>
          </Modal>

          {authError && !loginOpen && <p className="mx-auto max-w-[1024px] px-3 text-danger text-sm" role="alert">
            {authError}
          </p>}

          <div
            className="mx-auto max-w-[1024px] flex"
            style={{ minHeight: 'calc(100dvh - 4rem)' }}
          >
            <div className="max-w-64 hidden md:flex flex-col sticky top-[5rem] h-[100%] flex-shrink-0">
              <Listbox>
                {
                  visibleRoutes.map((r) => (
                    <ListboxItem
                      key={r.route}
                      href={r.route}
                      className="px-4 py-3"
                      variant="flat"
                      startContent={r.icon}
                    >
                      <p className="text-medium font-bold">{t(r.text)}</p>
                    </ListboxItem>
                  ))
                }
              </Listbox>

              <Divider className='mt-4 mb-4'/>

              <div className='text-tiny text-default-300 px-4'>
                <p>{t('copyright.reserved', { year: moment().year() })}</p>
              </div>
            </div>
            <div className='min-w-0' style={{ flex: '1 1 auto' }}>
              <Outlet/>
            </div>
          </div>
        </main>
      </LoadingContext.Provider>
    </MapTokenContext.Provider>
  );
}
