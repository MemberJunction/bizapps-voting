import { defineConfig } from 'vitest/config';

// One copy of Angular for the tests: MJ's packages are linked from their own checkout, and where that checkout keeps a store of
// its own the same Angular version would load twice (two copies of `@angular/core`, and injection fails with NG0203).
export default defineConfig({
  resolve: {
    dedupe: ['@angular/core', '@angular/common', '@angular/compiler', '@angular/forms', '@angular/platform-browser', '@angular/animations', 'rxjs'],
  },
  test: {
    server: { deps: { inline: [/@memberjunction\/ng-/, /@angular\//] } },
  },
});
