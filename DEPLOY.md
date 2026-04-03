# 公网部署说明

## 推荐方案

推荐使用一台 Linux 云服务器，系统可选 Ubuntu 22.04，并使用：

- `Node.js` 运行本项目后端
- `PostgreSQL` 存储数据
- `Nginx` 做反向代理
- `HTTPS` 证书对外提供安全访问

## 最短部署步骤

1. 购买云服务器并开放端口 `80` 和 `443`
2. 安装 Node.js 20+、PostgreSQL、Nginx
3. 把项目上传到服务器，例如 `/opt/employment-tracker`
4. 创建数据库 `employment_tracker`
5. 执行：
   `psql -U postgres -d employment_tracker -f db/schema.sql`
6. 配置 `.env`
7. 安装依赖：
   `npm install`
8. 启动服务：
   `npm start`

## 推荐使用 PM2 守护

安装：
`npm install -g pm2`

启动：
`pm2 start server.js --name employment-tracker`

开机自启：
`pm2 save`
`pm2 startup`

## Nginx 反向代理示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## HTTPS

推荐使用 `certbot`：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 上线前建议

- 修改管理员默认密码
- 使用强随机 `LLM_API_KEY`
- 设置数据库备份
- 给 Nginx 和 Node 配置日志
- 如果多人使用，建议继续增加角色权限和操作审计
