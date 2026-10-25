/**
 * Tailwind CDN configuration. index.html loads this immediately after the CDN
 * script defines the global `tailwind` configuration object.
 */
tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['Inter', 'sans-serif'],
                    },
                    boxShadow: {
                        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
                        'modal': '0 10px 40px -10px rgba(0, 0, 0, 0.3)',
                    }
                }
            }
        };
