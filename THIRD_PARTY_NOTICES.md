# 第三方依赖说明

本项目通过 npm 使用第三方依赖，不在源码仓库中分发 node_modules。依赖的精确版本与完整性信息见 package-lock.json。

主要依赖包括 Next.js、React、Tailwind CSS、mammoth、read-excel-file 和 unpdf。完整锁定依赖的许可声明索引见 [third-party-licenses.csv](docs/third-party-licenses.csv)。其中包含 MIT、Apache、BSD、LGPL、MPL 等声明；各依赖保留其自身许可。

执行 npm ci 后，可在对应 node_modules 包目录中查看 LICENSE、NOTICE 或包内许可信息。索引根据锁文件生成，主项目协议单独确认。
