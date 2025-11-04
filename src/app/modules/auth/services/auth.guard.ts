import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { TokenStorageService } from './token-storage.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private router: Router,
    private tokenStore: TokenStorageService
  ) {}

  canActivate(): boolean | UrlTree {
    const token = this.tokenStore.getToken();

    // Si no hay token, solo redirige (NO limpiar sesión aquí)
    if (!token) {
      return this.router.createUrlTree(['/auth/login']);
    }

    // Si el token está expirado, redirige (el interceptor decidirá si refresca o no)
    try {
      if (this.tokenStore.isExpired()) {
        return this.router.createUrlTree(['/auth/login']);
      }
    } catch {
      // Si por alguna razón falla el parse del JWT, trata como no autorizado
      return this.router.createUrlTree(['/auth/login']);
    }

    // Autorizado
    return true;
  }
}