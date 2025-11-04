import { Injectable, OnDestroy } from '@angular/core';
import { Observable, BehaviorSubject, of, Subscription } from 'rxjs';
import { map, catchError, switchMap, finalize } from 'rxjs/operators';
import { UserModel } from '../models/user.model';
import { AuthModel } from '../models/auth.model';
import { AuthHTTPService } from './auth-http';
import { environment } from 'src/environments/environment';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { URL_SERVICIOS } from 'src/app/config/config';
import { TokenStorageService } from './token-storage.service';


export type UserType = UserModel | undefined;

@Injectable({
  providedIn: 'root',
})
export class AuthService implements OnDestroy {
  // private fields
  private unsubscribe: Subscription[] = []; // Read more: => https://brianflove.com/2016/12/11/anguar-2-unsubscribe-observables/
  private authLocalStorageToken = `${environment.appVersion}-${environment.USERDATA_KEY}`;

  // public fields
  currentUser$: Observable<UserType>;
  isLoading$: Observable<boolean>;
  currentUserSubject: BehaviorSubject<UserType>;
  isLoadingSubject: BehaviorSubject<boolean>;

  get currentUserValue(): UserType {
    return this.currentUserSubject.value;
  }

  set currentUserValue(user: UserType) {
    this.currentUserSubject.next(user);
  }


  user : any = null;
  token : any = null;

  constructor(
    private authHttpService: AuthHTTPService,
    private router: Router,
    private http: HttpClient,
    private tokenStore: TokenStorageService
  ) {
    this.isLoadingSubject = new BehaviorSubject<boolean>(false);
    this.currentUserSubject = new BehaviorSubject<UserType>(undefined);
    this.currentUser$ = this.currentUserSubject.asObservable();
    this.isLoading$ = this.isLoadingSubject.asObservable();
    const subscr = this.getUserByToken().subscribe();
    this.unsubscribe.push(subscr);
  }

  // public methods
// Devuelve el token guardado por tu login()
getToken(): string | null {
  return this.tokenStore.getToken();
}

// (Opcional) Pega la info del usuario desde backend
me(): Observable<any> {
  return this.http.get(`${URL_SERVICIOS}/auth/me`).pipe(
    map((user: any) => {
      if (user) this.currentUserSubject.next(user);
      return user;
    }),
    catchError(() => of(undefined))
  );
}

// Renovación de token (usado por el interceptor en 401)
refresh(): Observable<any> {
  return this.http.post(`${URL_SERVICIOS}/auth/refresh`, {}).pipe(
    map((res: any) => {
      if (res?.access_token) {
        this.tokenStore.setToken(res.access_token);
      }
      return res;
    })
  );
}

// (Opcional) Golpea /logout del backend y luego limpia local
logoutApi(): Observable<any> {
  return this.http.post(`${URL_SERVICIOS}/auth/logout`, {}).pipe(
    finalize(() => this.logout())
  );
}

login(email: string, password: string): Observable<any> {
  this.isLoadingSubject.next(true);
  return this.http.post(`${URL_SERVICIOS}/auth/login`, { email, password }).pipe(
    map((auth: any) => {

      console.log('[DEBUG] respuesta backend', auth);
      const result = this.setAuthFromLocalStorage(auth); // ② segundo breakpoint aquí
      console.log('[DEBUG] resultado guardado', result);

      this.setAuthFromLocalStorage(auth);
      if (auth?.user) this.currentUserSubject.next(auth.user);
      return auth;
    }),
    catchError((err) => {
      console.error('login error', err);
      return of(undefined);
    }),
    finalize(() => this.isLoadingSubject.next(false))
  );
}

  logout() {
    this.tokenStore.clear();
    this.router.navigate(['/auth/login'], { queryParams: {} });
  }

 getUserByToken(): Observable<any> {
  const token = this.tokenStore.getToken();
  if (!token) return of(undefined);

  this.isLoadingSubject.next(true);
  return this.http.get(`${URL_SERVICIOS}/auth/me`).pipe(
    map((user: any) => {
      if (user) this.currentUserSubject.next(user);
      return user;
    }),
    catchError(err => {
      console.warn('[me] falló, no limpio sesión', err);
      // ⚠️ No llamar this.logout() aquí
      return of(undefined);
    }),
    finalize(() => this.isLoadingSubject.next(false))
  );
}

  // need create new user then login
  registration(user: UserModel): Observable<any> {
    this.isLoadingSubject.next(true);
    return this.authHttpService.createUser(user).pipe(
      map(() => {
        this.isLoadingSubject.next(false);
      }),
      switchMap(() => this.login(user.email, user.password)),
      catchError((err) => {
        console.error('err', err);
        return of(undefined);
      }),
      finalize(() => this.isLoadingSubject.next(false))
    );
  }

  forgotPassword(email: string): Observable<boolean> {
    this.isLoadingSubject.next(true);
    return this.authHttpService
      .forgotPassword(email)
      .pipe(finalize(() => this.isLoadingSubject.next(false)));
  }

  // private methods
private setAuthFromLocalStorage(auth: any): boolean {
  if (auth && auth.access_token) {                  // ✅ tus claves coinciden con Postman
    this.tokenStore.setUser(auth.user);            // { name, email }
    this.tokenStore.setToken(auth.access_token);   // guarda token y exp (si viene en JWT)
    return true;
  }
  return false;
}

private getAuthFromLocalStorage(): any | undefined {
  try {
    const user = this.tokenStore.getUser();
    if (!user) return undefined;

    this.user = user;
    this.token = this.tokenStore.getToken();
    return user;
  } catch (error) {
    console.error(error);
    return undefined;
  }
}


  ngOnDestroy() {
    this.unsubscribe.forEach((sb) => sb.unsubscribe());
  }
}
