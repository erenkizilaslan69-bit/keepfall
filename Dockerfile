# The game server (ASP.NET Core + SignalR) for a Docker host such as Render. The browser client is NOT in this image:
# it is built separately (client/, `npm run build:itch`) and uploaded to itch.io; this server only answers /hub, /api/* and /ping.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Keepfall.slnx ./
COPY src ./src
RUN dotnet publish src/Keepfall.Server -c Release -o /app /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app ./
COPY config ./config
ENV ASPNETCORE_ENVIRONMENT=Production
ENV Keepfall__BalancePath=/app/config/balance.json
# Render sets PORT (default 10000); the server listens on it (Program.cs).
EXPOSE 10000
ENTRYPOINT ["dotnet", "Keepfall.Server.dll"]
