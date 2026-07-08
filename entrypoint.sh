#!/bin/sh

# Replace PORT in nginx config
if [ -n "$PORT" ]; then
  sed -i "s/listen       8080;/listen       $PORT;/" /etc/nginx/conf.d/default.conf
fi

# Define actual values or default back to localhost if not specified
REST_URL="${REACT_APP_REST_API_URL}"
if [ -z "$REST_URL" ] || [ "$REST_URL" = "PLACEHOLDER_REACT_APP_REST_API_URL" ]; then
  REST_URL="http://localhost:13340"
fi

CAR_URL="${REACT_APP_CAR_API_URL}"
if [ -z "$CAR_URL" ] || [ "$CAR_URL" = "PLACEHOLDER_REACT_APP_CAR_API_URL" ]; then
  CAR_URL="http://localhost:13341"
fi

TRUCK_URL="${REACT_APP_TRUCK_API_URL}"
if [ -z "$TRUCK_URL" ] || [ "$TRUCK_URL" = "PLACEHOLDER_REACT_APP_TRUCK_API_URL" ]; then
  TRUCK_URL="http://localhost:13342"
fi

INRIX_URL="${REACT_APP_INRIX_API_URL}"
if [ -z "$INRIX_URL" ] || [ "$INRIX_URL" = "PLACEHOLDER_REACT_APP_INRIX_API_URL" ]; then
  INRIX_URL="http://localhost:13343"
fi

INRIX_HAAS_URL="${REACT_APP_INRIX_HAAS_API_URL}"
if [ -z "$INRIX_HAAS_URL" ] || [ "$INRIX_HAAS_URL" = "PLACEHOLDER_REACT_APP_INRIX_HAAS_API_URL" ]; then
  INRIX_HAAS_URL="$INRIX_URL"
fi

# Replace placeholders in the built JS files
echo "Injecting runtime environment variables..."
echo "REST_API_URL: $REST_URL"
echo "CAR_API_URL: $CAR_URL"
echo "TRUCK_API_URL: $TRUCK_URL"
echo "INRIX_API_URL: $INRIX_URL"
echo "INRIX_HAAS_API_URL: $INRIX_HAAS_URL"

find /usr/share/nginx/html -type f -name '*.js' -exec sed -i "s|PLACEHOLDER_REACT_APP_REST_API_URL|$REST_URL|g" {} +
find /usr/share/nginx/html -type f -name '*.js' -exec sed -i "s|PLACEHOLDER_REACT_APP_CAR_API_URL|$CAR_URL|g" {} +
find /usr/share/nginx/html -type f -name '*.js' -exec sed -i "s|PLACEHOLDER_REACT_APP_TRUCK_API_URL|$TRUCK_URL|g" {} +
find /usr/share/nginx/html -type f -name '*.js' -exec sed -i "s|PLACEHOLDER_REACT_APP_INRIX_API_URL|$INRIX_URL|g" {} +
find /usr/share/nginx/html -type f -name '*.js' -exec sed -i "s|PLACEHOLDER_REACT_APP_INRIX_HAAS_API_URL|$INRIX_HAAS_URL|g" {} +

# Start Nginx
exec nginx -g "daemon off;"
