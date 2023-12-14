{-# LANGUAGE DeriveGeneric #-}

module Wasp.Project.Analyze
  ( analyzeWaspProject,
    readPackageJsonFile,
  )
where

import Control.Arrow (ArrowChoice (left))
import Control.Monad.Except (ExceptT (ExceptT), runExceptT)
import qualified Data.Aeson as Aeson
import Data.List (find, isSuffixOf)
import StrongPath (Abs, Dir, File', Path', toFilePath, (</>))
import StrongPath.TH (relfile)
import qualified Wasp.Analyzer as Analyzer
import Wasp.Analyzer.AnalyzeError (getErrorMessageAndCtx)
import qualified Wasp.AppSpec as AS
import Wasp.AppSpec.PackageJson (PackageJson)
import Wasp.AppSpec.Valid (validateAppSpec)
import Wasp.CompileOptions (CompileOptions)
import qualified Wasp.CompileOptions as CompileOptions
import qualified Wasp.ConfigFile as CF
import Wasp.Error (showCompilerErrorForTerminal)
import qualified Wasp.ExternalCode as ExternalCode
import qualified Wasp.Generator.ConfigFile as G.CF
import Wasp.Project.Common (CompileError, WaspProjectDir, findFileInWaspProjectDir)
import Wasp.Project.Db (makeDevDatabaseUrl)
import Wasp.Project.Db.Migrations (findMigrationsDir)
import Wasp.Project.Deployment (loadUserDockerfileContents)
import Wasp.Project.Env (readDotEnvClient, readDotEnvServer)
import Wasp.Project.Vite (findCustomViteConfigPath)
import Wasp.Util (maybeToEither)
import qualified Wasp.Util.IO as IOUtil

analyzeWaspProject ::
  Path' Abs (Dir WaspProjectDir) ->
  CompileOptions ->
  IO (Either [CompileError] AS.AppSpec)
analyzeWaspProject waspDir options = runExceptT $ do
  waspFilePath <- ExceptT $ maybeToEither [fileNotFoundMessage] <$> findWaspFile waspDir
  declarations <- ExceptT $ analyzeWaspFileContent waspFilePath
  packageJsonContent <- ExceptT $ analyzePackageJsonContent waspDir
  ExceptT $ constructAppSpec waspDir options packageJsonContent declarations
  where
    fileNotFoundMessage = "Couldn't find the *.wasp file in the " ++ toFilePath waspDir ++ " directory"

analyzeWaspFileContent :: Path' Abs File' -> IO (Either [CompileError] [AS.Decl])
analyzeWaspFileContent waspFilePath = do
  waspFileContent <- IOUtil.readFile waspFilePath
  let declsOrAnalyzeError = Analyzer.analyze waspFileContent
  return $
    Control.Arrow.left
      (map (showCompilerErrorForTerminal (waspFilePath, waspFileContent) . getErrorMessageAndCtx))
      declsOrAnalyzeError

constructAppSpec ::
  Path' Abs (Dir WaspProjectDir) ->
  CompileOptions ->
  PackageJson ->
  [AS.Decl] ->
  IO (Either [CompileError] AS.AppSpec)
constructAppSpec waspDir options packageJson decls = do
  externalServerCodeFiles <-
    ExternalCode.readFiles (CompileOptions.externalServerCodeDirPath options)

  let externalClientCodeDirPath = CompileOptions.externalClientCodeDirPath options
  externalClientCodeFiles <- ExternalCode.readFiles externalClientCodeDirPath

  externalSharedCodeFiles <-
    ExternalCode.readFiles (CompileOptions.externalSharedCodeDirPath options)
  maybeMigrationsDir <- findMigrationsDir waspDir
  maybeUserDockerfileContents <- loadUserDockerfileContents waspDir
  configFiles <- CF.discoverConfigFiles waspDir G.CF.configFileRelocationMap
  let devDbUrl = makeDevDatabaseUrl waspDir decls
  serverEnvVars <- readDotEnvServer waspDir
  clientEnvVars <- readDotEnvClient waspDir

  let customViteConfigPath = findCustomViteConfigPath externalClientCodeFiles
  let appSpec =
        AS.AppSpec
          { AS.decls = decls,
            AS.packageJson = packageJson,
            AS.waspProjectDir = waspDir,
            AS.externalClientFiles = externalClientCodeFiles,
            AS.externalServerFiles = externalServerCodeFiles,
            AS.externalSharedFiles = externalSharedCodeFiles,
            AS.migrationsDir = maybeMigrationsDir,
            AS.devEnvVarsServer = serverEnvVars,
            AS.devEnvVarsClient = clientEnvVars,
            AS.isBuild = CompileOptions.isBuild options,
            AS.userDockerfileContents = maybeUserDockerfileContents,
            AS.configFiles = configFiles,
            AS.devDatabaseUrl = devDbUrl,
            AS.customViteConfigPath = customViteConfigPath
          }
  return $ case validateAppSpec appSpec of
    [] -> Right appSpec
    validationErrors -> Left $ map show validationErrors

findWaspFile :: Path' Abs (Dir WaspProjectDir) -> IO (Maybe (Path' Abs File'))
findWaspFile waspDir = do
  files <- fst <$> IOUtil.listDirectory waspDir
  return $ (waspDir </>) <$> find isWaspFile files
  where
    isWaspFile path =
      ".wasp"
        `isSuffixOf` toFilePath path
        && (length (toFilePath path) > length (".wasp" :: String))

analyzePackageJsonContent :: Path' Abs (Dir WaspProjectDir) -> IO (Either [CompileError] PackageJson)
analyzePackageJsonContent waspProjectDir =
  findPackageJsonFile >>= \case
    Just packageJsonFile -> readPackageJsonFile packageJsonFile
    Nothing -> return $ Left [fileNotFoundMessage]
  where
    fileNotFoundMessage = "couldn't find package.json file in the " ++ toFilePath waspProjectDir ++ " directory"
    findPackageJsonFile = findFileInWaspProjectDir waspProjectDir [relfile|package.json|]

readPackageJsonFile :: Path' Abs File' -> IO (Either [CompileError] PackageJson)
readPackageJsonFile packageJsonFile = do
  byteString <- IOUtil.readFileBytes packageJsonFile
  return $ maybeToEither ["Error reading the package.json file"] $ Aeson.decode byteString
