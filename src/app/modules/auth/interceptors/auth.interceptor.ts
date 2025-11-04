import { Injectable, Injector } from '@angular/core';
import {
  HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse, HttpClient, HttpBackend
} from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { URL_SERVICIOS } from 'src/app/config/config';
import { TokenStorageService } from '../services/token-storage.service';
import { Router } from '@angular/router';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshSubject = new BehaviorSubject<string | null>(null);

  // Endpoints públicos (NO llevan Authorization)
  private readonly publicPaths = ['/auth/login', '/auth/register'];

  // Usamos HttpBackend para crear un HttpClient "crudo" que no pase por interceptores
  private rawHttp: HttpClient;

  constructor(
    private injector: Injector,
    private tokenStore: TokenStorageService,
    httpBackend: HttpBackend
  ) {
    this.rawHttp = new HttpClient(httpBackend);
  }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    let request = req;

    const isApiCall = req.url.startsWith(URL_SERVICIOS);
    const isPublic = this.publicPaths.some(p => req.url.includes(p));

    if (isApiCall && !isPublic) {
      const token = this.tokenStore.getToken();
      if (token) {
        request = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
      }
    }

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 && isApiCall && !isPublic) {
          return this.handle401(request, next);
        }
        return throwError(() => error);
      })
    );
  }

  private handle401(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshSubject.next(null);

      return this.refreshWithHttpBackend().pipe(
        switchMap((newToken: string) => {
          this.isRefreshing = false;
          this.refreshSubject.next(newToken);
          const cloned = req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } });
          return next.handle(cloned);
        }),
        catchError(err => {
          this.isRefreshing = false;
          // Limpia sesión y redirige a login
          this.tokenStore.clear();
          // Obtener Router perezosamente evita ciclos
          const router = this.injector.get(Router);
          router.navigate(['/auth/login']);
          return throwError(() => err);
        })
      );
    } else {
      // Si ya hay refresh en curso, espera el nuevo token y reintenta
      return this.refreshSubject.pipe(
        filter(t => t !== null),
        take(1),
        switchMap(t => {
          const cloned = req.clone({ setHeaders: { Authorization: `Bearer ${t}` } });
          return next.handle(cloned);
        })
      );
    }
  }

  /**
   * Refresca el token usando un HttpClient que NO pasa por interceptores,
   * para evitar recursion/ciclos y NG0200.
   * Debe guardar el token nuevo en el TokenStorageService y devolverlo.
   */
  private refreshWithHttpBackend(): Observable<string> {
    return this.rawHttp.post<{ access_token: string }>(`${URL_SERVICIOS}/auth/refresh`, {}).pipe(
      switchMap((res) => {
        const newToken = res?.access_token;
        if (!newToken) {
          throw new Error('Refresh sin token');
        }
        this.tokenStore.setToken(newToken);
        return new BehaviorSubject(newToken); // retorna observable con el token
      })
    );
  }
}